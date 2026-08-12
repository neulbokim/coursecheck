/**
 * 「수강대상」 학년 자격 판정.
 *
 * 개설교과목정보의 「수강대상」이 실제 수강 가능 학년입니다. 「권장학년」은 권장일 뿐이라
 * 전학년 권장인 과목도 수강대상이 2,3,4학년이면 1학년은 신청할 수 없습니다.
 *
 * 표기는 「전학년」 또는 학년 나열(「2,3,4학년」·「1,4학년」)입니다. 나열은 연속 구간이
 * 아닐 수 있어(「1,4학년」) 최소 학년이 아니라 집합으로 봅니다.
 *
 * 소속 판정(affiliations.mjs)과 같은 원칙: **판정할 수 없으면 막지 않습니다** —
 * 빈 값이나 이 열이 없던 옛 자료 때문에 들을 수 있는 과목을 감추는 쪽이 더 나쁩니다.
 */

/**
 * 이수학기 수로 다음 학기의 학년을 셉니다. 두 학기가 한 학년이므로
 * 0~1학기 이수 → 1학년, 2~3학기 → 2학년, …, 8학기 이상(초과학기)은 4학년으로 봅니다.
 * @param {number | null | undefined} completedSemesters
 * @returns {number | null}
 */
export function gradeOfSemesters(completedSemesters) {
  if (typeof completedSemesters !== "number" || !Number.isFinite(completedSemesters)) return null;
  return Math.min(4, Math.floor(Math.max(0, completedSemesters) / 2) + 1);
}

/**
 * 「수강대상」에서 수강 가능 학년 집합을 뽑습니다.
 * @param {string | null | undefined} target
 * @returns {Set<number> | null} 제한이 없거나 판정할 수 없으면 null
 */
export function parseTargetGrades(target) {
  if (!target || /전\s*학년/.test(target)) return null;
  const grades = new Set();
  for (const match of target.matchAll(/([1-9])\s*[-~]\s*([1-9])|([1-9])/g)) {
    if (match[1]) {
      for (let grade = Number(match[1]); grade <= Number(match[2]); grade += 1) grades.add(grade);
    } else {
      grades.add(Number(match[3]));
    }
  }
  return grades.size > 0 ? grades : null;
}

/**
 * 이 학년이 과목을 신청할 수 있는지 판정합니다.
 * @param {string | null | undefined} target 개설과목의 「수강대상」
 * @param {number | null} grade 학생의 학년 (모르면 null)
 * @returns {{ eligible: boolean, reason: string }}
 */
export function checkGradeEligibility(target, grade) {
  const grades = parseTargetGrades(target);
  if (!grades || grade === null) return { eligible: true, reason: "" };
  if (grades.has(grade)) return { eligible: true, reason: "" };
  return { eligible: false, reason: `${[...grades].sort().join("·")}학년만 신청 가능` };
}
