/**
 * 서강대학교 요람 〈전공입문교과〉를 전공별로 옮긴 데이터입니다.
 *
 * 전공입문(전공예비·Pre-Major)은 요람 〈별표 1〉에서 공통필수·공통선택과 나란히 놓인
 * **학과(전공) 학생 필수** 영역입니다. 학점은 전공 학점에 포함되지 않지만 이수는 필수라,
 * 아직 안 들었다면 시간표에 보여야 합니다.
 *
 * 이 과목들이 그냥 두면 화면에서 사라지는 이유가 두 가지입니다.
 *
 * 1. 개설 학과가 내 전공과 다릅니다. `미적분학Ⅱ(STS2006)`는 전인교육원이 열고,
 *    화학전공의 `일반물리Ⅰ(PHY1001)`은 물리학과가 엽니다. 「학과」 열로는 절대 안 잡힙니다.
 * 2. 전인교육원·융합교육원 개설분은 교양으로 분류되어 「교양 전체」로 바꿔야만 보이고,
 *    그때도 자유교양 색으로 나옵니다.
 *
 * 그래서 여기 적힌 과목번호는 그 전공의 과목으로 함께 세고, 전공 색으로 보여줍니다.
 *
 * **학점 계산은 하지 않습니다.** 요람의 「6과목 중 택4」·「둘 중 택1」 같은 조건은 단일전공·
 * 다전공·교직마다 다르고, 이 앱은 남은 과목을 고르는 도구이지 졸업사정 도구가 아닙니다.
 * 그래서 어떤 경로든 후보가 될 수 있는 과목을 모두 담고, 조건은 `rule`에 글로 남깁니다.
 *
 * 다만 **누구에게 걸리는 조건인지**는 구분합니다. 요람의 전공입문표는 이수유형(심화 단일전공·
 * 다전공·교직)마다 다른 표라서, 아트&테크놀로지 1전공이 컴퓨터공학을 2전공하면 전공입문은
 * 「C 과목 택1」(3학점)뿐인데 심화 단일전공용 12학점까지 전부 보여주면 틀립니다. 프로필의
 * 전공 목록에서 파생할 수 있는 것만 씁니다:
 *
 * - `single`     이 전공 하나만 있는 사람 (서강대에서 단일전공은 심화과정)
 * - `multiFirst` 다전공이고 이 전공이 1전공
 * - `multiOther` 다전공이고 이 전공이 2·3전공 (요람의 「제1전공이 타전공」)
 *
 * 학번 조건(「23학번 이하만」)은 `fromCohort`/`untilCohort`로 적습니다. 교직과정은 프로필로
 * 알 수 없어 구분하지 않습니다 — 교직 전용 과목은 `appliesTo`를 비워 모두에게 보여줍니다.
 *
 * @typedef {"single" | "multiFirst" | "multiOther"} PreMajorTrack
 *
 * @typedef {Object} PreMajorGroup
 * @property {string} rule 요람에 적힌 이수 조건 (화면 안내에 그대로 씁니다)
 * @property {readonly string[]} codes 과목번호
 * @property {readonly PreMajorTrack[]} [appliesTo] 이 조건이 걸리는 이수유형 (없으면 전부)
 * @property {number} [fromCohort] 이 학번부터 적용 (예: 2024)
 * @property {number} [untilCohort] 이 학번까지만 적용 (예: 2023)
 *
 * @typedef {Object} PreMajorProgram
 * @property {string} major 개설과목 「학과」 열 표기 — 프로필 전공과 같은 이름
 * @property {readonly string[]} [aliases] 요람·옛 표기 등 같은 전공의 다른 이름
 * @property {readonly PreMajorGroup[]} groups
 */

export const preMajorSource = {
  label: "서강대학교 요람 〈전공입문교과〉",
  url: "https://www.sogang.ac.kr/ko/academic-support/college-bulletin",
  bulletinYear: 2026,
  verifiedAt: "2026-08-21",
};

/** 인문대학 공통: 인문세미나 필수 + 글로벌언어Ⅱ 택1 */
const HUMANITIES_GROUPS = [
  { rule: "인문세미나 1과목(3학점) 필수", codes: ["HSS3013"] },
  {
    rule: "글로벌언어Ⅱ 1과목(3학점) 선택 (국제학생 면제)",
    codes: ["TLS1004", "LCS2002", "LCS2004", "LCS2006", "LCS2008", "LCU4022", "LCU4026", "LCU4031", "LCU4036", "LCU4114"],
  },
];

/** 사회과학대학 공통: 글로벌언어Ⅱ 택1만 */
const SOCIAL_GROUPS = [
  {
    rule: "글로벌언어Ⅱ 1과목(3학점) 선택 (국제학생 면제)",
    codes: ["TLS1004", "LCS2002", "LCS2004", "LCS2006", "LCS2008", "LCU4022", "LCU4026", "LCU4031", "LCU4036", "LCU4114"],
  },
];

/** 자연과학대학 공통: 실험 과목 묶음 (전공마다 몇 과목을 고르는지만 다릅니다) */
const SCIENCE_LAB_CODES = ["PHY1101", "PHY1102", "CHM1051", "CHM1052", "BIO1105", "BIO1106"];

/**
 * 전공별 전공입문교과.
 * @type {readonly PreMajorProgram[]}
 */
export const preMajorPrograms = [
  // ── 인문대학 (요람 293~) ─────────────────────────────────────────────
  { major: "국어국문학과", groups: HUMANITIES_GROUPS },
  { major: "사학과", groups: HUMANITIES_GROUPS },
  { major: "철학과", groups: HUMANITIES_GROUPS },
  { major: "종교학과", groups: HUMANITIES_GROUPS },
  { major: "영미어문전공", groups: HUMANITIES_GROUPS },
  { major: "미국문화전공", groups: HUMANITIES_GROUPS },
  { major: "유럽문화학과", aliases: ["유럽문화전공"], groups: HUMANITIES_GROUPS },
  { major: "중국문화학과", aliases: ["중국문화전공"], groups: HUMANITIES_GROUPS },

  // ── 사회과학대학 (399~) ──────────────────────────────────────────────
  { major: "사회학과", groups: SOCIAL_GROUPS },
  { major: "정치외교학과", groups: SOCIAL_GROUPS },
  { major: "심리학과", groups: SOCIAL_GROUPS },

  // ── 자연과학대학 (437~) ──────────────────────────────────────────────
  {
    major: "수학과",
    groups: [
      { rule: "미적분학Ⅱ·미적분학실습 필수 (5학점)", codes: ["STS2006", "MAT1050", "MAT1060"] },
      {
        rule: "자연과학 기초 6과목 중 단일전공 택4 · 다전공 택2",
        codes: ["PHY1001", "PHY1002", "CHM1001", "CHM1002", "BIO1001", "BIO1002", "BIO1101", "BIO1102"],
      },
      { rule: "실험 6과목 중 단일전공 택2 · 다전공 택1", codes: SCIENCE_LAB_CODES },
    ],
  },
  {
    major: "물리학과",
    groups: [
      { rule: "일반물리Ⅰ·Ⅱ와 실험, 미적분학Ⅱ 필수 (11학점)", codes: ["PHY1001", "PHY1002", "PHY1101", "PHY1102", "STS2006"] },
      {
        rule: "화학 묶음 또는 생물 묶음 택1 (단일전공, 실험은 이론과 같은 분야로)",
        codes: ["CHM1001", "CHM1002", "CHM1051", "CHM1052", "BIO1001", "BIO1002", "BIO1101", "BIO1102", "BIO1105", "BIO1106"],
        appliesTo: ["single"],
      },
    ],
  },
  {
    major: "화학과",
    groups: [
      { rule: "일반화학Ⅰ·Ⅱ와 실험, 미적분학Ⅱ 필수 (11학점)", codes: ["CHM1001", "CHM1002", "CHM1051", "CHM1052", "STS2006"] },
      {
        rule: "물리·생물 과목에서 선택 이수 (11학점)",
        codes: ["PHY1001", "PHY1002", "PHY1101", "PHY1102", "BIO1101", "BIO1102", "BIO1105", "BIO1106"],
      },
    ],
  },
  {
    major: "생명과학과",
    groups: [
      { rule: "일반생물학Ⅰ·Ⅱ와 실험, 미적분학Ⅱ 필수 (11학점)", codes: ["BIO1101", "BIO1102", "BIO1105", "BIO1106", "STS2006"] },
      {
        rule: "물리 묶음 또는 화학 묶음 택1 (11학점)",
        codes: ["PHY1001", "PHY1002", "PHY1101", "PHY1102", "CHM1001", "CHM1002", "CHM1051", "CHM1052"],
      },
    ],
  },

  // ── 공과대학 (473~) ─────────────────────────────────────────────────
  {
    major: "전자공학과",
    groups: [
      {
        rule: "미적분학Ⅱ·C언어기초·고급공학수학Ⅰ·Ⅱ·일반물리Ⅰ·Ⅱ·일반물리실험Ⅰ (모든 이수유형 공통)",
        codes: ["STS2006", "EEE1002", "EEE2103", "EEE2104", "PHY1001", "PHY1002", "PHY1101"],
      },
      { rule: "창의전자설계 (단일전공과 전자공학 1전공 다전공만)", codes: ["EEE2032"], appliesTo: ["single", "multiFirst"] },
      { rule: "일반물리실험Ⅱ·선형대수학 (단일전공)", codes: ["PHY1102", "MAT2110"], appliesTo: ["single"] },
      { rule: "일반화학Ⅰ 또는 일반생물학Ⅰ 택1 (단일전공)", codes: ["CHM1001", "BIO1101"], appliesTo: ["single"] },
      { rule: "제1전공이 타전공이면 미적분학Ⅰ도 이수", codes: ["STS2005"], appliesTo: ["multiOther"] },
      { rule: "타전공생은 C언어기초 대신 고급응용C프로그래밍으로 대체 가능", codes: ["STS2008"], appliesTo: ["multiOther"] },
    ],
  },
  {
    major: "화공생명공학과",
    groups: [
      {
        rule: "미적분학Ⅱ·화공수학Ⅰ·Ⅱ·일반물리Ⅰ·일반물리실험Ⅰ·화공기초화학Ⅰ·Ⅱ·일반화학실험Ⅰ (모든 이수유형 공통)",
        codes: ["STS2006", "CBE2011", "CBE2012", "PHY1001", "PHY1101", "CBE2014", "CBE2015", "CHM1051"],
      },
      { rule: "일반화학실험Ⅱ (심화는 필수 · 다전공은 일반물리실험Ⅱ와 택1)", codes: ["CHM1052"] },
      { rule: "일반물리실험Ⅱ 또는 일반화학실험Ⅱ 택1 (다전공)", codes: ["PHY1102"], appliesTo: ["multiFirst", "multiOther"] },
      { rule: "일반물리Ⅱ 또는 화공기초생물학 택1", codes: ["PHY1002", "CBE2006"] },
      { rule: "23학번 이하는 화공기초화학Ⅰ·Ⅱ를 일반화학Ⅰ·Ⅱ로 대체 가능 (24학번부터 화공기초화학 필수)", codes: ["CHM1001", "CHM1002"], untilCohort: 2023 },
      { rule: "기초 전산화학공학 또는 고급응용C프로그래밍 택1 (심화)", codes: ["CBE2016", "STS2008"], appliesTo: ["single"] },
    ],
  },
  {
    major: "기계공학과",
    groups: [
      {
        rule: "일반물리Ⅰ·Ⅱ·일반물리실험Ⅰ·미적분학Ⅱ·공학수학Ⅰ·Ⅱ (모든 이수유형 공통)",
        codes: ["PHY1001", "PHY1002", "PHY1101", "STS2006", "MEE2006", "MEE2007"],
      },
      { rule: "일반물리실험Ⅱ (단일전공)", codes: ["PHY1102"], appliesTo: ["single"] },
      { rule: "지능형 기계설계생산 입문 (단일전공과 기계공학 1전공 다전공만)", codes: ["MEE1006"], appliesTo: ["single", "multiFirst"] },
      { rule: "일반화학Ⅰ (단일전공은 필수 · 다전공은 일반생물학Ⅰ과 택1)", codes: ["CHM1001"] },
      { rule: "일반생물학Ⅰ 또는 일반화학Ⅰ 택1 (다전공)", codes: ["BIO1001"], appliesTo: ["multiFirst", "multiOther"] },
      { rule: "제1전공이 타전공이면 미적분학Ⅰ·Ⅱ 모두 이수", codes: ["STS2005"], appliesTo: ["multiOther"] },
      { rule: "제1전공이 타전공이면 공학수학을 응용수학Ⅰ·Ⅱ로 대체 인정", codes: ["MAT2410", "MAT2420"], appliesTo: ["multiOther"] },
    ],
  },
  {
    major: "시스템반도체공학과",
    groups: [
      {
        rule: "미적분학Ⅱ·C언어기초·고급공학수학Ⅰ·Ⅱ·일반물리Ⅰ·Ⅱ (모든 이수유형 공통)",
        codes: ["STS2006", "SCE1002", "SCE2103", "SCE2104", "PHY1001", "PHY1002"],
      },
      { rule: "시스템반도체입문설계 (단일전공과 시스템반도체 1전공 다전공만)", codes: ["SCE2032"], appliesTo: ["single", "multiFirst"] },
      {
        rule: "일반물리실험Ⅱ·선형대수학·일반화학Ⅰ (단일전공·SK하이닉스 취업트랙)",
        codes: ["PHY1102", "MAT2110", "CHM1001"],
        appliesTo: ["single", "multiFirst"],
      },
      { rule: "제1전공이 타전공이면 미적분학Ⅰ도 이수", codes: ["STS2005"], appliesTo: ["multiOther"] },
      { rule: "타전공생은 C언어기초를 타 학과 C 과목으로 대체 가능", codes: ["STS2008", "CSE2035", "EEE1002", "MEE1005", "CSW2010"], appliesTo: ["multiOther"] },
    ],
  },
  {
    major: "반도체공학과",
    groups: [
      {
        rule: "미적분학Ⅱ·C언어기초·고급공학수학Ⅰ·Ⅱ·일반물리Ⅰ·Ⅱ (모든 이수유형 공통)",
        codes: ["STS2006", "SCE1002", "SCE2103", "SCE2104", "PHY1001", "PHY1002"],
      },
      { rule: "반도체입문설계 (단일전공과 반도체공학 1전공 다전공만)", codes: ["SCE2033"], appliesTo: ["single", "multiFirst"] },
      { rule: "일반물리실험Ⅱ·선형대수학·일반화학Ⅰ (단일전공)", codes: ["PHY1102", "MAT2110", "CHM1001"], appliesTo: ["single"] },
      { rule: "제1전공이 타전공이면 미적분학Ⅰ도 이수", codes: ["STS2005"], appliesTo: ["multiOther"] },
      { rule: "타전공생은 C언어기초를 타 학과 C 과목으로 대체 가능", codes: ["STS2008", "CSE2035", "EEE1002", "MEE1005", "CSW2010"], appliesTo: ["multiOther"] },
    ],
  },

  // ── 소프트웨어융합대학 (541~) ────────────────────────────────────────
  {
    major: "컴퓨터공학과",
    groups: [
      { rule: "미적분학Ⅱ·일반물리Ⅰ·응용수학Ⅰ·Ⅱ (심화 단일전공 12학점)", codes: ["STS2006", "PHY1001", "MAT2410", "MAT2420"] },
      { rule: "집합론·선형대수학·정수론 택1 (심화 단일전공)", codes: ["MAT2010", "MAT2110", "MAT2120"] },
      { rule: "교직과정은 일반물리실험Ⅰ도 이수", codes: ["PHY1101"] },
      { rule: "제1전공이 타전공이면 C 과목 택1", codes: ["STS2008", "AIE2050", "CSW2010", "EEE1002", "MEE1005", "SSE1002"] },
    ],
  },
  {
    major: "인공지능학과",
    groups: [
      { rule: "미적분학Ⅱ·응용수학Ⅰ·Ⅱ·선형대수학 (12학점)", codes: ["STS2006", "MAT2410", "MAT2420", "MAT2110"] },
      { rule: "타전공생은 컴퓨터프로그래밍Ⅱ 대신 고급응용C프로그래밍 수강 가능", codes: ["STS2008"] },
    ],
  },

  // ── 경제대학 (571~) · 경영대학 (587~) ────────────────────────────────
  {
    major: "경제학과",
    groups: [
      { rule: "회계학원론 필수", codes: ["MGT2003"] },
      { rule: "경제수리기초·미적분학Ⅰ·미적분학Ⅱ 택1", codes: ["ECO2003", "STS2005", "STS2006"] },
    ],
  },
  {
    major: "경영학부(경영학전공)",
    aliases: ["경영학전공", "경영학부"],
    groups: [
      { rule: "경제학원론Ⅰ·Ⅱ 택1", codes: ["ECO2001", "ECO2002"] },
      { rule: "경영통계학·경제통계학·통계학입문·응용수학Ⅰ 택1", codes: ["MGT2002", "ECO2004", "MAT3020", "MAT2410"] },
      { rule: "대학수학·미적분학Ⅰ·미적분학Ⅱ 택1", codes: ["STS2004", "STS2005", "STS2006"] },
    ],
  },

  // ── 지식융합미디어대학 (607~) ────────────────────────────────────────
  {
    major: "아트&테크놀로지학과",
    aliases: ["Art & Technology"],
    groups: [{ rule: "대학수학·미적분학Ⅰ 택1", codes: ["STS2004", "STS2005"] }],
  },

  // ── 로욜라국제대학 (641~) ────────────────────────────────────────────
  {
    major: "글로벌한국학부",
    aliases: ["글로벌한국학과"],
    groups: [{ rule: "GKS1001·GKS1002 필수 (6학점)", codes: ["GKS1001", "GKS1002"] }],
  },
  {
    major: "게페르트국제학부",
    groups: [
      { rule: "국제관계개론·국제통상입문·아시아학개론 (9학점)", codes: ["TIS1001", "TIS1002", "AAS1001"] },
      { rule: "국제통상전공 단일전공은 국제통상수리기초도 이수", codes: ["TIS1005"], appliesTo: ["single"] },
    ],
  },
  {
    major: "글로벌융합학부",
    groups: [{ rule: "한국언어문화전공 국제학생 전용 (국내 학생 면제)", codes: ["KLC1028"] }],
  },
];

/**
 * 전공 이름을 비교용으로 정규화합니다. 요람과 개설과목의 표기가 공백·구분자에서 갈립니다
 * (`SCIENCE기반 자유전공학부` vs `SCIENCE기반자유전공학부`).
 * @param {string} value
 */
function normalizeMajor(value) {
  return String(value).normalize("NFKC").replace(/[\s&·/]+/g, "").toLowerCase();
}

/**
 * 전공 이름으로 전공입문교과를 찾습니다.
 * @param {string} major
 * @returns {PreMajorProgram | null}
 */
export function preMajorProgramFor(major) {
  if (!major) return null;
  const key = normalizeMajor(major);
  return (
    preMajorPrograms.find(
      (program) =>
        normalizeMajor(program.major) === key ||
        (program.aliases ?? []).some((alias) => normalizeMajor(alias) === key),
    ) ?? null
  );
}

/**
 * 이 사람이 index번째 전공을 어떤 이수유형으로 하는지 — 전공 목록만으로 파생합니다.
 * @param {readonly string[]} majors 1·2·3전공 순서
 * @param {number} index
 * @returns {PreMajorTrack}
 */
export function preMajorTrackOf(majors, index) {
  if (majors.length <= 1) return "single";
  return index === 0 ? "multiFirst" : "multiOther";
}

/**
 * 이 묶음이 이 사람에게 걸리는 조건인지.
 * 학번을 모르면(cohortYear 없음) 학번 조건은 통과시킵니다 — 잘못 숨기는 것보다 낫습니다.
 * @param {PreMajorGroup} group
 * @param {PreMajorTrack} track
 * @param {number} [cohortYear]
 */
function groupApplies(group, track, cohortYear) {
  if (group.appliesTo && !group.appliesTo.includes(track)) return false;
  if (cohortYear) {
    if (group.fromCohort && cohortYear < group.fromCohort) return false;
    if (group.untilCohort && cohortYear > group.untilCohort) return false;
  }
  return true;
}

/**
 * 내 전공들의 전공입문 과목번호 표를 만듭니다.
 * 앞선 전공(1전공)이 이깁니다 — 같은 과목이 여러 전공의 전공입문일 수 있습니다.
 * 이수유형(단일·다전공)과 학번에 맞는 묶음만 담습니다.
 * @param {readonly string[]} majors 1·2·3전공 순서
 * @param {number} [cohortYear] 입학연도 (모르면 학번 조건 무시)
 * @returns {Map<string, { rank: number, major: string, rule: string }>}
 */
export function preMajorCodeMap(majors, cohortYear) {
  const map = new Map();
  majors.forEach((major, index) => {
    const program = preMajorProgramFor(major);
    if (!program) return;
    const track = preMajorTrackOf(majors, index);
    for (const group of program.groups) {
      if (!groupApplies(group, track, cohortYear)) continue;
      for (const code of group.codes) {
        if (!map.has(code)) map.set(code, { rank: index + 1, major: program.major, rule: group.rule });
      }
    }
  });
  return map;
}

/**
 * 전공입문교과가 있는 전공인지 — 화면 안내를 띄울지 정할 때 씁니다.
 * @param {readonly string[]} majors
 */
export function majorsWithPreMajor(majors) {
  return majors.filter((major) => preMajorProgramFor(major));
}
