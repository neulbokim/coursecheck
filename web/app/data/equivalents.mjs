import { normalizeCourseName } from "../lib/course-name.mjs";

/**
 * 요람이 「택1」·「대체 인정」·「중복 수강 불가」로 묶어 둔 과목 묶음입니다.
 * 한 묶음에서 하나를 이수했으면 나머지도 들을 필요가 없으므로 함께 제외합니다.
 *
 * 근거는 모두 요람 본문 또는 개설과목 비고에서 옮겼고 `source`에 적었습니다.
 * 확인하지 못한 관계는 넣지 않습니다.
 *
 * 근거가 **한 전공의 전공입문 규정**인 묶음에는 `appliesTo`를 답니다. 「대학수학·미적분학 3 택1」은
 * 경영학전공 전공입문표의 한 줄이지 학교 전체 규칙이 아니어서, 그대로 모두에게 걸면 미적분학Ⅰ을
 * 필수선택으로 들은 이과 학생에게서 **전공입문 필수인 미적분학Ⅱ가 사라집니다.**
 *
 * @typedef {Object} EquivalentGroup
 * @property {string} key
 * @property {string} label 사용자에게 보여줄 묶음 이름
 * @property {readonly string[]} codes 과목번호
 * @property {readonly string[]} names 과목명 (과거 명칭 포함, 코드가 안 잡힐 때 이름으로 매칭)
 * @property {string} source 근거
 * @property {readonly string[]} [appliesTo] 이 규정을 둔 전공 (없으면 전 학생 공통)
 */

/** @type {readonly EquivalentGroup[]} */
export const equivalentGroups = [
  {
    key: "statistics",
    label: "통계학",
    codes: ["MAT3020", "MGT2002", "ECO2004", "MAT2410", "SOC2004"],
    names: ["통계학입문", "경영통계학", "경제통계학", "응용수학Ⅰ", "사회통계학"],
    source:
      "2026 요람: 「MGT2002 경영통계학, ECO2004 경제통계학, MAT3020 통계학입문, MAT2410 응용수학Ⅰ 3 택1」 · " +
      "「경제통계학(ECO2004)을 경영통계학(MGT2002)이나 통계학입문(MAT3020) 또는 응용수학Ⅰ(MAT2410)으로 대체할 수 있으며, 경제통계학을 중복 수강할 수 없음」 · " +
      "「MAT3020(통계학입문)과 MAT2410(응용수학Ⅰ)은 강의 내용이 유사하므로 1과목만 수강하여야 함」",
  },
  {
    key: "appliedMath",
    label: "응용수학Ⅰ · 통신수학",
    codes: ["MAT2410", "MAT3440"],
    names: ["응용수학Ⅰ", "통신수학"],
    source: "2026 요람 MAT3440 통신수학: 「MAT2410과 동등한 과목이다」",
  },
  {
    key: "collegeMath",
    label: "대학수학 · 미적분학",
    codes: ["STS2004", "STS2005", "STS2006"],
    names: ["대학수학", "미적분학Ⅰ", "미적분학Ⅱ"],
    source:
      "2026 요람 경영학전공 전공입문과목: 「STS2004 대학수학, STS2005 미적분학Ⅰ, STS2006 미적분학Ⅱ 택1」 · " +
      "아트&테크놀로지학과 Pre-Major: 「STS2004 대학수학, STS2005 미적분학Ⅰ 중 1과목」",
    appliesTo: ["경영학부(경영학전공)", "아트&테크놀로지학과"],
  },
  {
    key: "economicMath",
    label: "경제수리기초 · 미적분학",
    codes: ["ECO2003", "STS2005", "STS2006"],
    names: ["경제수리기초", "미적분학Ⅰ", "미적분학Ⅱ"],
    source:
      "2026 요람 경제학전공: 「미적분학Ⅰ 혹은 미적분학Ⅱ를 이수한 학생은 경제수리기초를 중복 수강할 수 없음」",
    appliesTo: ["경제학과"],
  },
  {
    key: "englishComm1",
    label: "영어글로벌의사소통Ⅰ",
    codes: ["COR1003", "COR1005"],
    names: ["영어글로벌의사소통Ⅰ", "영어글로벌 의사소통Ⅰ"],
    source: "2026-2 개설과목 비고 COR1005: 「COR1003과 중복 수강 불가」",
  },
  {
    key: "computationalThinking",
    label: "컴퓨팅 사고력",
    codes: ["COR1009", "COR1011"],
    names: ["컴퓨팅 사고력"],
    source: "2020 요람 소프트웨어 영역: 「COR1009 컴퓨팅 사고력 / COR1011 컴퓨팅 사고력(고급)」 중 이수",
  },
  {
    key: "patentTransfer",
    label: "특허와 기술이전",
    codes: ["PHY4203", "CHM4203", "BIO4203"],
    names: ["특허와 기술이전"],
    source:
      "2026 요람: 「물리 특허와 기술이전(PHY4203)은 타 학과 특허와 기술이전(화학 CHM4203, 생명 BIO4203) 과목과 중복 수강할 수 없음」",
  },
];

/**
 * 전공 이름 비교용 정규화. 요람과 개설과목의 공백·구분자 표기가 갈린다.
 * @param {string} value
 */
function normalizeMajor(value) {
  return String(value).normalize("NFKC").replace(/[\s&·/]+/g, "").toLowerCase();
}

/**
 * 내 전공에 적용되는 묶음만 남깁니다. `appliesTo`가 없는 묶음은 전 학생 공통입니다.
 * @param {readonly string[]} majors
 */
function groupsFor(majors) {
  const mine = new Set(majors.map(normalizeMajor));
  return equivalentGroups.filter(
    (group) => !group.appliesTo || group.appliesTo.some((major) => mine.has(normalizeMajor(major))),
  );
}

/** 한 과목이 여러 묶음에 속할 수 있다 — 미적분학Ⅰ은 「대학수학」과 「경제수리기초」 묶음 모두에 있다 */
function addTo(map, key, groupKey) {
  const found = map.get(key);
  if (found) found.add(groupKey);
  else map.set(key, new Set([groupKey]));
}

/**
 * 과목번호 → 묶음 key 집합
 * @param {readonly string[]} [majors] 내 전공 (전공별 묶음을 걸러낼 때)
 * @returns {Map<string, Set<string>>}
 */
export function equivalentCodeMap(majors = []) {
  const map = new Map();
  for (const group of groupsFor(majors)) {
    for (const code of group.codes) addTo(map, code, group.key);
  }
  return map;
}

/**
 * 정규화한 과목명 → 묶음 key 집합
 * @param {readonly string[]} [majors] 내 전공 (전공별 묶음을 걸러낼 때)
 * @returns {Map<string, Set<string>>}
 */
export function equivalentNameMap(majors = []) {
  const map = new Map();
  for (const group of groupsFor(majors)) {
    for (const name of group.names) addTo(map, normalizeCourseName(name), group.key);
  }
  return map;
}

/**
 * 이수한 과목(이름·코드)으로 같은 묶음 과목을 모두 찾아 제외 대상 이름을 넓힙니다.
 * @param {readonly {name: string, code?: string}[]} taken
 * @param {readonly {name: string, code: string}[]} offerings 현재 개설과목
 * @param {readonly string[]} [majors] 내 전공 — 한 전공의 규정인 묶음은 그 전공일 때만 건다
 * @returns {{ names: Set<string>, groups: Set<string> }} 추가로 제외할 정규화 과목명과 걸린 묶음
 */
export function expandEquivalents(taken, offerings, majors = []) {
  const byName = equivalentNameMap(majors);
  const byCode = equivalentCodeMap(majors);
  const mineGroups = groupsFor(majors);
  const groups = new Set();

  for (const course of taken) {
    const matched = [
      ...(course.code ? byCode.get(course.code) ?? [] : []),
      ...(byName.get(normalizeCourseName(course.name)) ?? []),
    ];
    for (const key of matched) groups.add(key);
  }

  const names = new Set();
  if (groups.size === 0) return { names, groups };

  // 묶음에 적힌 과목명과, 개설과목 중 같은 묶음 코드를 가진 과목명을 모두 제외 대상으로
  for (const group of mineGroups) {
    if (!groups.has(group.key)) continue;
    for (const name of group.names) names.add(normalizeCourseName(name));
  }
  for (const offering of offerings) {
    for (const key of byCode.get(offering.code) ?? []) {
      if (groups.has(key)) names.add(normalizeCourseName(offering.name));
    }
  }
  return { names, groups };
}

/**
 * 묶음 key로 사람이 읽을 라벨을 찾습니다.
 * @param {string} key
 */
export function equivalentLabel(key) {
  return equivalentGroups.find((group) => group.key === key)?.label ?? key;
}
