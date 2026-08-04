import coursesJson from "./courses.generated.json";
import { linkedMajors } from "./majors";

export const departmentOptions = [...new Set(coursesJson.map((course) => course.department))]
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b, "ko"));

export const majorOptions = [
  ...linkedMajors.map((major) => major.label),
  ...departmentOptions,
].filter((major, index, all) => all.indexOf(major) === index);

export function normalizeMajorSearch(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
