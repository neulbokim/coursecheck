/**
 * 과목명을 비교용 키로 정규화합니다.
 * 요람 표기(공백·로마숫자)와 개설과목·에브리타임 표기 차이를 흡수합니다.
 * @param {string} value
 */
export function normalizeCourseName(value) {
  return value
    .normalize("NFKC")
    .replace(/\([^)]*(캡스톤|영어|온라인|재수강|고급|중급|초급)[^)]*\)/gi, "")
    .replace(/[\s·&_,()-]+/g, "")
    .toLowerCase();
}
