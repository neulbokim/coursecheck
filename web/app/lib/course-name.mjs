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

/** 한글·한자·전각 기호. 라틴 글자보다 두 배 가까이 넓다 */
const WIDE_CHARACTER = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿＀-￯]/;

/**
 * 과목명이 차지할 가로 폭을 어림합니다. 글자 수로만 재면 영문 과목명이 과하게 길어 보입니다 —
 * 「Fundamentals of Programming and Problem Solving」은 47자지만 「기초인공지능프로그래밍」 두 배가
 * 채 안 됩니다. 전각 1, 그 밖에 0.5로 셉니다.
 * @param {string} name
 * @returns {number}
 */
export function courseNameWidth(name) {
  let width = 0;
  for (const character of String(name)) width += WIDE_CHARACTER.test(character) ? 1 : 0.5;
  return width;
}

/**
 * 시간표 카드의 글씨 크기 등급. 한 칸에 여러 과목이 세로로 쌓이므로, 짧은 이름은 키워 읽기 쉽게 하고
 * 긴 이름은 줄 수가 불어나지 않게 작게 둡니다. 실제 크기는 `globals.css`가 화면 폭별로 정합니다.
 * @param {string} name
 * @returns {"" | "name-short" | "name-long"}
 */
export function courseNameSize(name) {
  const width = courseNameWidth(name);
  if (width <= 6) return "name-short";
  if (width > 11) return "name-long";
  return "";
}
