/**
 * SIS 개설교과목정보 파싱.
 *
 * SIS가 내려주는 `.xls`는 실제로는 HTML 표입니다
 * (`<meta content="application/vnd.ms-excel">` + `<table>`), 그래서 엑셀 파서 없이 읽습니다.
 * CLI(`scripts/import-sis.mjs`)와 관리 화면 업로드가 같은 코드를 씁니다.
 */

const REQUIRED_COLUMNS = ["학년도", "학기", "학과", "과목번호", "과목명"];
const MIN_ROWS = 50;

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} html SIS가 내려준 `.xls`(HTML 표) 원문
 * @returns {{ courses: object[], semester: string }}
 * @throws {Error} 표를 못 읽거나 필요한 열이 없으면
 */
export function parseSisCourses(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decodeHtml(cell[1])),
  );
  const [headers, ...records] = rows;
  if (!headers || headers.length === 0) {
    throw new Error("표를 찾지 못했어요. SIS에서 내려받은 파일이 맞는지 확인해 주세요.");
  }

  const missing = REQUIRED_COLUMNS.filter((name) => !headers.includes(name));
  if (missing.length > 0) {
    throw new Error(`필요한 열이 없어요: ${missing.join(", ")}`);
  }

  const column = Object.fromEntries(headers.map((name, index) => [name, index]));
  const take = (row, name) => row[column[name]] ?? "";

  const courses = records
    .filter((row) => take(row, "과목번호") && take(row, "과목명"))
    .map((row) => ({
      id: `${take(row, "과목번호")}-${take(row, "분반")}`,
      year: Number(take(row, "학년도").replace(/\D/g, "")),
      term: take(row, "학기"),
      department: take(row, "학과"),
      code: take(row, "과목번호"),
      section: take(row, "분반"),
      name: take(row, "과목명"),
      credits: Number(take(row, "학점")) || 0,
      schedule: take(row, "수업시간/강의실"),
      professor: take(row, "교수진"),
      // SIS는 「영어강의」 열에 O만 찍는다. 영어강의 요건이 남은 학생이 찾아야 하는 값이라 남긴다
      english: /^[oO○]$/.test(take(row, "영어강의")),
      // 수강 자격 판정이 이 필드를 본다 — 「경영대학(가능)」 표기가 수강신청 참조사항에 있다
      note: [take(row, "수강신청 참조사항"), take(row, "비고")]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500),
    }));

  if (courses.length < MIN_ROWS) {
    throw new Error(`과목이 ${courses.length}개뿐이에요. 전체 학기 파일이 맞는지 확인해 주세요.`);
  }

  const first = courses[0];
  const semester = first.year && first.term ? `${first.year}-${first.term.replace(/학기/, "")}` : "";
  return { courses, semester };
}
