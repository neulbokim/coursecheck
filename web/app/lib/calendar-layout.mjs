/**
 * 담은 과목을 시간에 비례한 캘린더로 배치합니다.
 *
 * 개설과목의 시작 시각은 모두 15분 배수이고 종료는 11:50·18:50만 예외라
 * 10분 격자에 모든 수업이 정확히 맞습니다. 그래서 행 하나를 10분으로 두고
 * 블록의 위치와 높이를 실제 시각·길이로 계산합니다.
 *
 * 같은 요일에 시간이 겹치는 수업은 레인(열)을 나눠 나란히 놓고 `conflict`로 표시합니다.
 * 담은 과목은 보통 6~8개라 레인이 2~3개를 넘지 않습니다.
 */
export const SLOT_MINUTES = 10;

/** 격자 경계로 내림·올림 */
const floorSlot = (value) => Math.floor(value / SLOT_MINUTES) * SLOT_MINUTES;
const ceilSlot = (value) => Math.ceil(value / SLOT_MINUTES) * SLOT_MINUTES;

/**
 * 한 요일의 수업을 레인에 배치합니다. 시작이 이른 순으로 가장 먼저 비는 레인에 넣습니다.
 * @template T
 * @param {Array<T & { meeting: { start: number, end: number } }>} entries
 * @returns {{ lanes: number, blocks: Array<{ entry: T, lane: number, conflict: boolean }> }}
 */
export function assignLanes(entries) {
  const sorted = [...entries].sort(
    (a, b) => a.meeting.start - b.meeting.start || a.meeting.end - b.meeting.end,
  );
  /** @type {number[]} 레인별 마지막 종료 시각 */
  const laneEnds = [];
  const blocks = sorted.map((entry) => {
    let lane = laneEnds.findIndex((end) => end <= entry.meeting.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.meeting.end);
    } else {
      laneEnds[lane] = entry.meeting.end;
    }
    return { entry, lane, conflict: false };
  });

  // 실제로 시간이 겹치는 쌍을 모두 충돌로 표시한다 (레인이 달라도 겹침은 겹침)
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i].entry.meeting;
      const b = blocks[j].entry.meeting;
      if (a.start < b.end && b.start < a.end) {
        blocks[i].conflict = true;
        blocks[j].conflict = true;
      }
    }
  }

  return { lanes: Math.max(laneEnds.length, 1), blocks };
}

/**
 * 캘린더 전체 배치를 계산합니다.
 * @template T
 * @param {Array<T & { meeting: { day: string, start: number, end: number } }>} entries
 * @param {readonly string[]} days
 * @param {{ minStart?: number, minEnd?: number }} [bounds] 최소로 보여줄 시간 범위(분)
 */
export function layoutCalendar(entries, days, bounds = {}) {
  const onDays = entries.filter((entry) => days.includes(entry.meeting.day));
  const minStart = bounds.minStart ?? 9 * 60;
  const minEnd = bounds.minEnd ?? 18 * 60;

  const startMin = floorSlot(Math.min(minStart, ...onDays.map((entry) => entry.meeting.start)));
  const endMin = ceilSlot(Math.max(minEnd, ...onDays.map((entry) => entry.meeting.end)));
  const rows = Math.max(1, (endMin - startMin) / SLOT_MINUTES);

  const byDay = {};
  let conflictCount = 0;
  for (const day of days) {
    const { lanes, blocks } = assignLanes(onDays.filter((entry) => entry.meeting.day === day));
    byDay[day] = {
      lanes,
      blocks: blocks.map((block) => {
        if (block.conflict) conflictCount += 1;
        return {
          ...block,
          rowStart: (floorSlot(block.entry.meeting.start) - startMin) / SLOT_MINUTES + 1,
          rowSpan: Math.max(
            1,
            (ceilSlot(block.entry.meeting.end) - floorSlot(block.entry.meeting.start)) / SLOT_MINUTES,
          ),
        };
      }),
    };
  }

  return { startMin, endMin, rows, byDay, conflictCount };
}

/**
 * 시간 눈금(정시)을 만듭니다.
 * @param {number} startMin
 * @param {number} endMin
 */
export function hourMarks(startMin, endMin) {
  const marks = [];
  const rows = (endMin - startMin) / SLOT_MINUTES;
  for (let time = Math.ceil(startMin / 60) * 60; time <= endMin; time += 60) {
    const row = (time - startMin) / SLOT_MINUTES + 1;
    // 마지막 정시가 격자 밖(row > rows)이면 암시적 행이 생겨 눈금과 블록이 어긋난다
    if (row > rows) continue;
    marks.push({ time, row });
  }
  return marks;
}
