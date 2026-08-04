/**
 * 수업을 시작·종료 시각별 행과 요일별 열로 묶습니다.
 * 행 높이는 셀 안의 과목 수와 이름 길이에 맞춰 자연스럽게 늘어납니다.
 * @template T
 * @param {Array<T & { meeting: { day: string, start: number, end: number } }>} entries
 * @param {readonly string[]} days
 */
export function groupTimetableEntries(entries, days) {
  const slots = new Map();

  for (const entry of entries) {
    const { day, start, end } = entry.meeting;
    if (!days.includes(day)) continue;
    const key = `${start}-${end}`;
    if (!slots.has(key)) {
      slots.set(key, {
        start,
        end,
        byDay: Object.fromEntries(days.map((item) => [item, []])),
      });
    }
    slots.get(key).byDay[day].push(entry);
  }

  return [...slots.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}
