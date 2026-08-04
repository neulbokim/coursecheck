/**
 * 같은 요일과 시간에 겹치는 수업을 서로 다른 가로 칸에 배치합니다.
 * @template T
 * @param {Array<T & { meeting: { day: string, start: number, end: number } }>} entries
 * @param {readonly string[]} days
 */
export function layoutTimetableEntries(entries, days) {
  return days.flatMap((day) => {
    const dayEntries = entries
      .filter((entry) => entry.meeting.day === day)
      .sort((a, b) => a.meeting.start - b.meeting.start || a.meeting.end - b.meeting.end);
    const result = [];
    let cluster = [];
    let clusterEnd = -Infinity;

    function flushCluster() {
      if (cluster.length === 0) return;
      const laneEnds = [];
      const placed = cluster.map((entry) => {
        let lane = laneEnds.findIndex((end) => end <= entry.meeting.start);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = entry.meeting.end;
        return { ...entry, lane };
      });
      const laneCount = laneEnds.length;
      result.push(...placed.map((entry) => ({ ...entry, laneCount })));
      cluster = [];
      clusterEnd = -Infinity;
    }

    for (const entry of dayEntries) {
      if (cluster.length > 0 && entry.meeting.start >= clusterEnd) flushCluster();
      cluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.meeting.end);
    }
    flushCluster();
    return result;
  });
}
