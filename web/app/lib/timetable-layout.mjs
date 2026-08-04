/**
 * 수업을 「시작 시각」 행과 요일 열로 묶습니다.
 *
 * 종료 시각까지 키로 쓰면 13:30~14:45와 13:30~16:15가 서로 다른 행이 되어
 * 같은 교시가 두 줄로 갈라집니다. 개설과목의 시작 시각은 19가지뿐이지만
 * (시작,종료) 조합은 69가지여서 행이 세 배 이상 늘어납니다.
 * 그래서 시작 시각만으로 묶어 실제 교시처럼 정렬하고, 종료 시각은 각 과목 카드에 적습니다.
 *
 * @template T
 * @param {Array<T & { meeting: { day: string, start: number, end: number } }>} entries
 * @param {readonly string[]} days
 * @returns {Array<{ start: number, end: number, byDay: Record<string, T[]> }>}
 *   `end`는 그 행에서 가장 늦게 끝나는 수업의 종료 시각입니다.
 */
export function groupTimetableEntries(entries, days) {
  const slots = new Map();

  for (const entry of entries) {
    const { day, start, end } = entry.meeting;
    if (!days.includes(day)) continue;
    if (!slots.has(start)) {
      slots.set(start, {
        start,
        end,
        byDay: Object.fromEntries(days.map((item) => [item, []])),
      });
    }
    const slot = slots.get(start);
    slot.end = Math.max(slot.end, end);
    slot.byDay[day].push(entry);
  }

  return [...slots.values()].sort((a, b) => a.start - b.start);
}
