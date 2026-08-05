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
