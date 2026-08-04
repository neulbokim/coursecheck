/**
 * 수강 자격 판정.
 *
 * 개설교과목정보의 「수강신청 참조사항」에는 소속별 수강 가능 여부가 적혀 있습니다.
 * 표기는 네 가지이고, 뜻은 같은 필드의 자유 서술이 확인해 줍니다.
 *
 * | 표기               | 뜻                                  | 확인 문구 |
 * | ------------------ | ----------------------------------- | --------- |
 * | `X(가능)`          | X 소속만 수강 가능                  | —         |
 * | `X(불가능)`        | X 소속은 전공 순번 무관 불가        | 「컴퓨터공학과 제1전공, 제2전공, 제3전공자 불가능」 |
 * | `X(1전공 가능)`    | X의 1전공자만 가능                  | 「인공지능학과 제1전공자만 수강 가능」 |
 * | `X(1전공 불가능)`  | X의 1전공자만 불가                  | 「컴퓨터공학과 제1전공자 수강 불가능」 |
 *
 * 「전학년수강신청일에 … 수강신청 가능」류는 자격이 아니라 신청 시기 안내라 판정에 쓰지 않습니다.
 *
 * 학과 → 대학 매핑은 2026 요람 목차의 페이지 범위로 복원했습니다.
 */

/** 학과(전공) → 소속 대학. 요람 목차 기준. */
const DEPARTMENT_COLLEGE = {
  // 인문대학 (요람 293~)
  "국어국문학과": "인문대학",
  "사학과": "인문대학",
  "철학과": "인문대학",
  "종교학과": "인문대학",
  "영미어문전공": "인문대학",
  "미국문화전공": "인문대학",
  "유럽문화전공": "인문대학",
  "유럽문화학과": "인문대학",
  "중국문화학과": "인문대학",
  "인문학기반 자유전공학부": "인문대학",
  "인문학기반자유전공학부": "인문대학",
  // 사회과학대학 (399~)
  "사회학과": "사회과학대학",
  "정치외교학과": "사회과학대학",
  "심리학과": "사회과학대학",
  // 자연과학대학 (437~)
  "수학과": "자연과학대학",
  "물리학과": "자연과학대학",
  "화학과": "자연과학대학",
  "생명과학과": "자연과학대학",
  "SCIENCE기반 자유전공학부": "자연과학대학",
  "SCIENCE기반자유전공학부": "자연과학대학",
  // 공과대학 (473~)
  "전자공학과": "공과대학",
  "화공생명공학과": "공과대학",
  "기계공학과": "공과대학",
  "시스템반도체공학과": "공과대학",
  "반도체공학과": "공과대학",
  // 소프트웨어융합대학 (541~)
  "컴퓨터공학과": "소프트웨어융합대학",
  "인공지능학과": "소프트웨어융합대학",
  "AI기반 자유전공학부": "소프트웨어융합대학",
  "AI기반자유전공학부": "소프트웨어융합대학",
  // 경제대학 (571~) · 경영대학 (587~)
  "경제학과": "경제대학",
  "경영학부(경영학전공)": "경영대학",
  // 지식융합미디어대학 (607~)
  "지식융합미디어대학": "지식융합미디어대학",
  "신문방송학과": "지식융합미디어대학",
  "미디어&엔터테인먼트학과": "지식융합미디어대학",
  "아트&테크놀로지학과": "지식융합미디어대학",
  "Art & Technology": "지식융합미디어대학",
  // 로욜라국제대학 (641~)
  "게페르트국제학부": "로욜라국제대학",
  "글로벌융합학부": "로욜라국제대학",
  "한국언어문화전공": "로욜라국제대학",
  "글로벌경제전공": "로욜라국제대학",
  "글로벌경영전공": "로욜라국제대학",
  "글로벌미디어전공": "로욜라국제대학",
};

/**
 * 개설과목 표기에 같은 조직의 옛 이름·줄임말·잘린 이름이 섞여 있어 하나로 모읍니다.
 * (예: 「커뮤니케이션대학(가능)」 56건, 「지식융합미디어학부(가능)」 40건은 모두 지식융합미디어대학)
 */
const AFFILIATION_ALIASES = {
  "커뮤니케이션대학": "지식융합미디어대학",
  "커뮤니케이션학부": "지식융합미디어대학",
  "지식융합대학": "지식융합미디어대학",
  "지식융합미디어학부": "지식융합미디어대학",
  "지식융합미디어": "지식융합미디어대학",
  "신방": "신문방송학과",
  "SCIENCE기반자유전": "SCIENCE기반자유전공학부",
  "글로벌한국학": "글로벌한국학부",
  "Art & Technology": "아트&테크놀로지학과",
};

/** 2024학번부터 로욜라국제대학, 그 전에는 지식융합미디어대학 */
const GLOBAL_KOREAN_STUDIES = ["글로벌한국학부", "글로벌한국학과", "Global Korean Studies"];
const GLOBAL_KOREAN_MOVED_YEAR = 2024;

/**
 * 소속 이름을 비교용으로 정규화합니다. 개설과목 표기는 공백·구분자가 들쭉날쭉합니다
 * (`빅데이터사이언스연계전공` vs `빅데이터사이언스 연계전공`).
 * @param {string} value
 */
export function normalizeAffiliation(value) {
  const key = value
    .normalize("NFKC")
    .replace(/[\s&·/]+/g, "")
    .replace(/^제/, "")
    .toLowerCase();
  for (const [alias, canonical] of Object.entries(AFFILIATION_ALIASES)) {
    if (alias.normalize("NFKC").replace(/[\s&·/]+/g, "").toLowerCase() === key) {
      return canonical.normalize("NFKC").replace(/[\s&·/]+/g, "").toLowerCase();
    }
  }
  return key;
}

/**
 * 학과(전공)의 소속 대학을 찾습니다.
 * @param {string} department
 * @param {number} [cohortYear]
 * @returns {string | null}
 */
export function collegeOfDepartment(department, cohortYear = GLOBAL_KOREAN_MOVED_YEAR) {
  const key = normalizeAffiliation(department);
  if (GLOBAL_KOREAN_STUDIES.some((name) => normalizeAffiliation(name) === key)) {
    return cohortYear >= GLOBAL_KOREAN_MOVED_YEAR ? "로욜라국제대학" : "지식융합미디어대학";
  }
  const found = Object.entries(DEPARTMENT_COLLEGE).find(([name]) => normalizeAffiliation(name) === key);
  return found ? found[1] : null;
}

/**
 * 사용자의 소속 목록을 만듭니다. 1전공은 복전 신청과 무관하게 항상 인정합니다.
 * @param {{ cohortYear?: number, college?: string | null, majors: Array<{ name: string, rank: number, approved: boolean }> }} input
 * @param {string | null} [collegeLabel] 프로필에서 고른 소속 대학의 이름
 * @returns {{ any: Set<string>, firstMajor: Set<string> }} 정규화된 소속 집합 (전체 / 1전공만)
 */
export function affiliationsOf(input, collegeLabel = null) {
  const any = new Set();
  const firstMajor = new Set();
  const add = (set, value) => { if (value) set.add(normalizeAffiliation(value)); };

  add(any, collegeLabel);
  add(firstMajor, collegeLabel);

  for (const major of input.majors) {
    // 1전공은 소속 그 자체이므로 항상 인정, 2·3전공은 복전 신청이 끝나야 인정
    if (major.rank !== 1 && !major.approved) continue;
    const college = collegeOfDepartment(major.name, input.cohortYear);
    add(any, major.name);
    add(any, college);
    if (major.rank === 1) {
      add(firstMajor, major.name);
      add(firstMajor, college);
    }
  }
  return { any, firstMajor };
}

/**
 * 「수강신청 참조사항」에서 자격 표기만 뽑습니다.
 * @param {string} note
 * @returns {Array<{ name: string, allow: boolean, firstMajorOnly: boolean }>}
 */
export function parseEligibility(note) {
  const rules = [];
  if (!note) return rules;
  for (const match of note.matchAll(/([가-힣A-Za-z0-9()·&/]+?)\((1전공\s*)?(불?가능)\)/g)) {
    const name = match[1].trim();
    // 신청 시기 안내(「전학년수강신청일에 …」)는 자격이 아니다
    if (!name || /수강신청일|비경제전공자/.test(name)) continue;
    rules.push({ name, allow: match[3] === "가능", firstMajorOnly: Boolean(match[2]) });
  }
  return rules;
}

/**
 * 이 과목을 신청할 수 있는지 판정합니다.
 * 판정할 수 없으면(표기가 없거나 모르는 소속) 막지 않습니다 — 들을 수 있는 과목을 감추는 쪽이 더 나쁩니다.
 * @param {string} note
 * @param {{ any: Set<string>, firstMajor: Set<string> }} affiliations
 * @returns {{ eligible: boolean, reason: string }}
 */
export function checkEligibility(note, affiliations) {
  const rules = parseEligibility(note);
  if (rules.length === 0) return { eligible: true, reason: "" };

  const mine = (rule) => {
    const set = rule.firstMajorOnly ? affiliations.firstMajor : affiliations.any;
    return set.has(normalizeAffiliation(rule.name));
  };

  // 금지가 우선한다
  for (const rule of rules) {
    if (!rule.allow && mine(rule)) {
      return {
        eligible: false,
        reason: rule.firstMajorOnly ? `${rule.name} 1전공자는 신청 불가` : `${rule.name} 소속은 신청 불가`,
      };
    }
  }

  const allowRules = rules.filter((rule) => rule.allow);
  if (allowRules.length === 0) return { eligible: true, reason: "" };
  if (allowRules.some(mine)) return { eligible: true, reason: "" };

  const names = [...new Set(allowRules.map((rule) => rule.name))].slice(0, 3).join(", ");
  return { eligible: false, reason: `${names} 소속만 신청 가능` };
}
