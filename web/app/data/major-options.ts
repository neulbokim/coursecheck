import coursesJson from "./courses.generated.json";
import { codeBasedMajors } from "./majors";

export const departmentOptions = [...new Set(coursesJson.map((course) => course.department))]
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b, "ko"));

// 연계전공·학생설계전공을 학과보다 앞에 둔다 — 학과명이 겹쳐 보이는 이름이 많아
// 「데이터과학」처럼 검색했을 때 제도 이름이 붙은 쪽을 먼저 보여주는 편이 헷갈리지 않는다.
export const majorOptions = [
  ...codeBasedMajors.map((major) => major.label),
  ...departmentOptions,
].filter((major, index, all) => all.indexOf(major) === index);

export function normalizeMajorSearch(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/**
 * 전공 자동완성 검색. 친 글자가 이름의 앞쪽에서 맞을수록 위로 올립니다 —
 * 「경영」을 치면 「…경영」이 뒤에 붙는 설계전공 10여 개보다 「경영학부(경영학전공)」가
 * 먼저 나와야 하고, 잘라서 보여줘도 앞에서 맞은 이름이 살아남아야 합니다.
 * 맞은 위치가 같으면 기존 순서(연계·설계전공 먼저)를 지킵니다.
 */
export function searchMajors(value: string, limit = 7) {
  const query = normalizeMajorSearch(value);
  if (!query) return [];
  return majorOptions
    .map((major, order) => ({ major, order, at: normalizeMajorSearch(major).indexOf(query) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .slice(0, limit)
    .map((item) => item.major);
}
