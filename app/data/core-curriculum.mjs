import { normalizeCourseName } from "../lib/course-name.mjs";

/**
 * 서강대학교 요람 〈별표 1〉 필수 교양 이수계획표를 그대로 옮긴 데이터입니다.
 *
 * 2016~2018 요람은 「중핵필수·중핵필수선택」 7영역 체계이고,
 * 2019 요람부터 「공통필수·공통선택」 4영역 체계로 바뀌었습니다. 두 체계를 따로 담습니다.
 * 같은 체계 안에서 늘거나 빠진 과목은 `from`(적용 시작 요람 연도)과 `until`(마지막 인정 연도)로 표시합니다.
 *
 * @typedef {"인문" | "자연"} Stream
 *
 * @typedef {Object} College
 * @property {string} key
 * @property {string} label
 * @property {Stream} stream 글쓰기 영역의 계열 구분
 * @property {Record<string, string>} [pinned] 요람이 지정한 영역별 필수선택 과목 (트랙 key → 과목번호)
 * @property {number} [from] 이 요람 연도부터 존재하는 소속
 *
 * @typedef {Object} CoreCourse
 * @property {readonly string[]} codes 요람 과목번호와 개설과목에서 쓰이는 변형 코드
 * @property {string} name 현행 과목명
 * @property {readonly string[]} [formerNames] 과거 과목명 (지난 학기 수강 내역 판정용)
 * @property {number} [from] 이 요람 연도부터 지정된 과목
 * @property {number} [until] 이 요람 연도까지 지정된 과목
 * @property {Stream} [stream] 이 계열만 이수하는 과목
 * @property {string} [note] 요람 비고
 *
 * @typedef {Object} CoreTrack
 * @property {string} key
 * @property {string} label
 * @property {string} group
 * @property {string} credits
 * @property {string} rule
 * @property {string} color
 * @property {readonly CoreCourse[]} courses
 * @property {string} [pinnedNote] 소속 대학 때문에 과목이 하나로 좁혀졌을 때의 안내
 */

export const FIRST_BULLETIN_YEAR = 2016;
export const LAST_BULLETIN_YEAR = 2026;
export const CORE_SYSTEM_CHANGE_YEAR = 2019;

export const coreCurriculumSource = {
  label: "서강대학교 요람 〈별표 1〉 필수 교양 이수계획표",
  url: "https://www.sogang.ac.kr/ko/academic-support/college-bulletin",
  verifiedAt: "2026-08-04",
  firstYear: FIRST_BULLETIN_YEAR,
  lastYear: LAST_BULLETIN_YEAR,
};

/**
 * 소속 대학. `pinned`는 요람 비고의 「필수선택」 지정을 그대로 옮긴 것입니다.
 * @type {readonly College[]}
 */
export const colleges = [
  { key: "humanities", label: "인문대학", stream: "인문" },
  { key: "social", label: "사회과학대학", stream: "인문" },
  { key: "economics", label: "경제대학", stream: "인문" },
  { key: "business", label: "경영대학", stream: "인문" },
  { key: "media", label: "지식융합미디어대학", stream: "인문" },
  { key: "loyola", label: "로욜라국제대학", stream: "인문" },
  { key: "science", label: "자연과학대학", stream: "자연", pinned: { science: "STS2005" } },
  { key: "engineering", label: "공과대학", stream: "자연", pinned: { science: "STS2005" } },
  { key: "software", label: "소프트웨어융합대학", stream: "자연", pinned: { science: "STS2005" } },
  { key: "freeHumanities", label: "인문학기반 자유전공학부", stream: "인문", from: 2025, pinned: { thought: "HSS3032" } },
  { key: "freeScience", label: "SCIENCE기반 자유전공학부", stream: "자연", from: 2025, pinned: { science: "STS2015" } },
];

/** 2019~2026 요람: 공통필수교과 11학점(2021학번 8학점) + 공통선택교과 12학점 */
const COMMON_TRACKS = [
  {
    key: "character",
    label: "서강인성",
    group: "공통필수",
    credits: "1학점",
    rule: "필수 · 1학년",
    color: "#861f1c",
    courses: [
      {
        codes: ["COR1007"],
        name: "성찰과 성장",
        formerNames: ["성찰과 성장Ⅰ", "성찰과 성장 1"],
        note: "국제·편입·장애학생 면제",
      },
    ],
  },
  {
    key: "writing",
    label: "글쓰기",
    group: "공통필수",
    credits: "3학점",
    rule: "계열별 1과목",
    color: "#a3352e",
    courses: [
      { codes: ["COR1012"], name: "인문사회 글쓰기", stream: "인문", note: "인문계열" },
      { codes: ["COR1013"], name: "자연계 글쓰기", stream: "자연", note: "자연계열" },
    ],
  },
  {
    key: "language",
    label: "글로벌 언어Ⅰ",
    group: "공통필수",
    credits: "3학점",
    rule: "개설강의 중 1과목",
    color: "#e3540b",
    courses: [
      { codes: ["COR1003", "COR1005"], name: "영어글로벌의사소통Ⅰ", formerNames: ["영어글로벌 의사소통Ⅰ"] },
      { codes: ["LCS2001"], name: "독일언어와 문화Ⅰ" },
      { codes: ["LCS2003"], name: "프랑스언어와 문화Ⅰ" },
      { codes: ["LCS2005"], name: "중국언어와 문화Ⅰ" },
      { codes: ["LCS2007"], name: "일본언어와 문화Ⅰ" },
      { codes: ["LCU4021"], name: "초급 라틴어" },
      { codes: ["LCU4025"], name: "초급 이탈리아어" },
      { codes: ["LCU4030"], name: "초급 스페인어" },
      { codes: ["LCU4035"], name: "초급 러시아어" },
      { codes: ["LCU4105"], name: "초급 아랍어" },
    ],
  },
  {
    key: "seminar",
    label: "전공·진로 탐색",
    group: "공통필수",
    credits: "1학점",
    rule: "필수 · 편입생 제외",
    color: "#5c2976",
    courses: [
      {
        codes: ["COR1015", "COR1016", "COR1020"],
        name: "알바트로스 세미나",
        formerNames: ["알바트로스 세미나(경영)", "알바트로스 세미나(로욜라국제)", "신입생 세미나"],
      },
    ],
  },
  {
    key: "software",
    label: "소프트웨어",
    group: "공통필수",
    credits: "3학점",
    rule: "필수 · 1학년",
    color: "#005783",
    courses: [
      { codes: ["COR1009", "COR1011"], name: "컴퓨팅 사고력", until: 2020 },
      { codes: ["COR1010"], name: "기초인공지능프로그래밍", from: 2022 },
    ],
  },
  {
    key: "faith",
    label: "① 인간과 신앙",
    group: "공통선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#6f9453",
    courses: [
      { codes: ["HFS2001"], name: "철학적 인간학" },
      { codes: ["HFS2002"], name: "신학적 인간학" },
      { codes: ["HFS2003"], name: "그리스도교 윤리" },
      { codes: ["HFU4012"], name: "그리스도교 신앙과 영성" },
      { codes: ["HFU4023"], name: "진·선·미·성" },
    ],
  },
  {
    key: "thought",
    label: "② 인간과 사상",
    group: "공통선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#004f8e",
    courses: [
      { codes: ["ETS2001"], name: "현대세계와 윤리문제" },
      { codes: ["ETS2002"], name: "논리와 비판적 사고" },
      { codes: ["ETS2004"], name: "종교와 세계문화" },
      { codes: ["CHS2002"], name: "현대 한국의 형성" },
      { codes: ["CHS2003"], name: "현대 동아시아의 형성" },
      { codes: ["CHS2004"], name: "현대 서양의 형성" },
      { codes: ["HSS3032"], name: "인문학의 세계", from: 2025 },
      { codes: ["ETS2005"], name: "AI와 휴머니즘", from: 2026 },
    ],
  },
  {
    key: "society",
    label: "③ 인간과 사회",
    group: "공통선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#e0803a",
    courses: [
      { codes: ["SHS2001"], name: "현대사회의 이해" },
      { codes: ["SHS2002"], name: "한국과 세계" },
      { codes: ["SHS2003"], name: "커뮤니케이션과 사회" },
      { codes: ["SHS2007"], name: "생활속의 심리학" },
      { codes: ["SHS2005"], name: "법과 지식재산", formerNames: ["법과 지식산업"] },
      { codes: ["SHS2011"], name: "AI와 미래사회", from: 2026 },
      { codes: ["SHS2012"], name: "생태와 지속가능한 사회", from: 2026 },
    ],
  },
  {
    key: "science",
    label: "④ 인간과 과학 & AI",
    group: "공통선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#7d5b16",
    courses: [
      { codes: ["STS2001"], name: "자연과 인간" },
      { codes: ["STS2002"], name: "생명과 환경" },
      { codes: ["STU4011"], name: "우주와 양자", formerNames: ["우주와 원자시대"] },
      { codes: ["STS2011"], name: "기초빅데이터프로그래밍" },
      { codes: ["STS2012"], name: "딥러닝기반빅데이터처리실습" },
      { codes: ["STS2010"], name: "과학사" },
      { codes: ["STS2005"], name: "미적분학Ⅰ" },
      { codes: ["STS2015"], name: "과학도를 위한 파이썬", from: 2025 },
    ],
  },
];

/** 2016~2018 요람: 중핵필수 + 중핵필수선택 7영역 (필수 영역은 모집단위별로 다름) */
const CORE_TRACKS = [
  {
    key: "reading",
    label: "읽기와 쓰기",
    group: "중핵필수",
    credits: "3학점",
    rule: "필수 · 1학년",
    color: "#861f1c",
    courses: [
      {
        codes: ["COR1001"],
        name: "읽기와 쓰기",
        note: "2019학번부터 인문사회 글쓰기·자연계 글쓰기로 대체",
      },
    ],
  },
  {
    key: "globalComm",
    label: "글로벌 의사소통Ⅰ",
    group: "중핵필수",
    credits: "3학점",
    rule: "필수 · 1학년",
    color: "#e3540b",
    courses: [{ codes: ["COR1003", "COR1005"], name: "글로벌 의사소통 1", formerNames: ["영어글로벌의사소통Ⅰ"] }],
  },
  {
    key: "character",
    label: "서강인성",
    group: "중핵필수",
    credits: "1학점",
    rule: "필수 · 1학년",
    color: "#a3352e",
    courses: [
      { codes: ["COR1007"], name: "성찰과 성장 1", formerNames: ["성찰과 성장", "성찰과 성장Ⅰ"], note: "국제학생 한시 면제" },
    ],
  },
  {
    key: "software",
    label: "컴퓨팅 사고력",
    group: "중핵필수",
    credits: "3학점",
    rule: "필수 · 1학년",
    color: "#005783",
    courses: [
      { codes: ["COR1009"], name: "컴퓨팅 사고력" },
      { codes: ["COR1011"], name: "컴퓨팅 사고력(고급)", note: "컴퓨터공학전공" },
    ],
  },
  {
    key: "faith",
    label: "① 인간과 신앙의 탐구",
    group: "중핵필수선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#6f9453",
    courses: [
      { codes: ["HFS2001"], name: "철학적 인간학" },
      { codes: ["HFS2002"], name: "신학적 인간학" },
      { codes: ["HFS2003"], name: "그리스도교 윤리" },
    ],
  },
  {
    key: "ethics",
    label: "② 윤리와 사상의 탐구",
    group: "중핵필수선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#004f8e",
    courses: [
      { codes: ["ETS2001"], name: "현대세계와 윤리문제" },
      { codes: ["ETS2002"], name: "논리와 비판적 사고" },
      { codes: ["ETS2003"], name: "철학 산책" },
      { codes: ["ETS2004"], name: "종교와 세계 문화" },
    ],
  },
  {
    key: "history",
    label: "③ 문명과 역사의 탐구",
    group: "중핵필수선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#5c2976",
    courses: [
      { codes: ["CHS2001"], name: "한국 문화와 역사" },
      { codes: ["CHS2002"], name: "현대 한국의 형성" },
      { codes: ["CHS2003"], name: "현대 동아시아의 형성" },
      { codes: ["CHS2004"], name: "현대 서양의 형성" },
      { codes: ["CHS2006"], name: "역사란 무엇인가" },
    ],
  },
  {
    key: "society",
    label: "④ 사회와 인간의 탐구",
    group: "중핵필수선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#e0803a",
    courses: [
      { codes: ["SHS2001"], name: "현대사회의 이해" },
      { codes: ["SHS2002"], name: "한국과 세계" },
      { codes: ["SHS2003"], name: "커뮤니케이션과 사회" },
      { codes: ["SHS2004"], name: "경제와 사회" },
      { codes: ["SHS2005"], name: "법과 공학", formerNames: ["법과 지식산업", "법과 지식재산"] },
      { codes: ["SHS2006"], name: "기업과 경영의 이해" },
      { codes: ["SHS2007"], name: "생활속의 심리학" },
    ],
  },
  {
    key: "science",
    label: "⑤ 과학과 기술의 탐구",
    group: "중핵필수선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#7d5b16",
    courses: [
      { codes: ["STS2001"], name: "자연과 인간" },
      { codes: ["STS2002"], name: "생명과 환경" },
      { codes: ["STS2003"], name: "공학과 기술의 이해", until: 2016 },
      { codes: ["STS2004"], name: "대학수학" },
      { codes: ["STS2005"], name: "미적분학Ⅰ" },
      { codes: ["STS2006"], name: "미적분학Ⅱ" },
      { codes: ["STU4011"], name: "우주와 원자시대", formerNames: ["우주와 양자"] },
      { codes: ["STS2010"], name: "과학사" },
      {
        codes: ["STS2011"],
        name: "응용 소프트웨어 프로그래밍",
        formerNames: ["고급 응용 소프트웨어 프로그래밍", "기초 응용 소프트웨어 프로그래밍", "기초빅데이터프로그래밍"],
        from: 2017,
      },
    ],
  },
  {
    key: "worldLanguage",
    label: "⑥ 국제사회 언어와 문화의 탐구",
    group: "중핵필수선택",
    credits: "3학점",
    rule: "1과목 선택",
    color: "#005783",
    courses: [
      { codes: ["LCS2001"], name: "독일언어와 문화Ⅰ" },
      { codes: ["LCS2003"], name: "프랑스언어와 문화Ⅰ" },
      { codes: ["LCS2005"], name: "중국언어와 문화Ⅰ" },
      { codes: ["LCS2007"], name: "일본언어와 문화Ⅰ" },
      { codes: ["LCS2009"], name: "한국어와 문화Ⅰ", from: 2018, note: "국제학생 전용" },
      { codes: ["LCS2010"], name: "한국어와 문화Ⅱ", from: 2018, note: "국제학생 전용" },
    ],
  },
  {
    key: "expression",
    label: "⑦ 사고와 언어 표현의 탐구",
    group: "중핵필수선택",
    credits: "3~6학점",
    rule: "TLS1001~1003 중 1과목 + 영역 전체 중 1과목",
    color: "#6f9453",
    courses: [
      { codes: ["TLS1001"], name: "독서와 토론" },
      { codes: ["TLS1002"], name: "비평적 글쓰기 연습" },
      { codes: ["TLS1003"], name: "스토리텔링 글쓰기 연습" },
      { codes: ["TLS1004"], name: "글로벌 의사소통 2", formerNames: ["영어글로벌의사소통Ⅱ"] },
      { codes: ["TLS1005"], name: "영어읽기와 토론 연습" },
      { codes: ["TLS1006"], name: "실용영어와 발표 연습" },
    ],
  },
];

/**
 * 입학 연도를 적용 요람 연도로 맞춥니다. 보유한 요람은 2016~2026입니다.
 * @param {number} cohortYear
 */
export function bulletinYearFor(cohortYear) {
  if (!Number.isFinite(cohortYear)) return LAST_BULLETIN_YEAR;
  return Math.min(Math.max(Math.trunc(cohortYear), FIRST_BULLETIN_YEAR), LAST_BULLETIN_YEAR);
}

/**
 * 해당 요람 연도에 존재하는 소속 대학만 남깁니다.
 * @param {number} cohortYear
 */
export function collegesFor(cohortYear) {
  const bulletinYear = bulletinYearFor(cohortYear);
  return colleges.filter((college) => !college.from || bulletinYear >= college.from);
}

/**
 * @param {string | null | undefined} collegeKey
 * @returns {College | null}
 */
export function collegeByKey(collegeKey) {
  return colleges.find((college) => college.key === collegeKey) ?? null;
}

/**
 * 학번과 소속 대학에 맞는 필수 교양 트랙을 만듭니다.
 * 계열(글쓰기)과 요람이 지정한 영역별 필수선택 과목까지 반영합니다.
 * @param {number} cohortYear
 * @param {string | null} [collegeKey]
 * @returns {CoreTrack[]}
 */
export function coreTracksFor(cohortYear, collegeKey = null) {
  const bulletinYear = bulletinYearFor(cohortYear);
  const college = collegeByKey(collegeKey);
  const source = bulletinYear >= CORE_SYSTEM_CHANGE_YEAR ? COMMON_TRACKS : CORE_TRACKS;

  return source
    .map((track) => {
      const inYear = track.courses.filter(
        (course) => (!course.from || bulletinYear >= course.from) && (!course.until || bulletinYear <= course.until),
      );
      const byStream = college ? inYear.filter((course) => !course.stream || course.stream === college.stream) : inYear;
      const pinnedCode = college?.pinned?.[track.key];
      const pinned = pinnedCode ? byStream.filter((course) => course.codes.includes(pinnedCode)) : [];
      const courses = pinned.length > 0 ? pinned : byStream;
      const pinnedNote = pinned.length > 0 ? `${college.label} 필수선택` : undefined;
      return { ...track, courses, ...(pinnedNote ? { pinnedNote } : {}) };
    })
    .filter((track) => track.courses.length > 0);
}

/**
 * 과목번호로 트랙을 찾을 수 있는 표를 만듭니다.
 * @param {readonly CoreTrack[]} tracks
 * @returns {Map<string, string>}
 */
export function coreTrackCodeMap(tracks) {
  const map = new Map();
  for (const track of tracks) {
    for (const course of track.courses) {
      for (const code of course.codes) map.set(code, track.key);
    }
  }
  return map;
}

/**
 * 트랙별 인정 과목명(현행·과거)을 정규화한 집합으로 만듭니다.
 * @param {readonly CoreTrack[]} tracks
 * @returns {Map<string, Set<string>>}
 */
export function coreTrackNameMap(tracks) {
  const map = new Map();
  for (const track of tracks) {
    const names = new Set();
    for (const course of track.courses) {
      names.add(normalizeCourseName(course.name));
      for (const former of course.formerNames ?? []) names.add(normalizeCourseName(former));
    }
    map.set(track.key, names);
  }
  return map;
}

/**
 * 가져온 수강 과목명으로 이미 이수한 트랙을 추정합니다.
 * @param {readonly CoreTrack[]} tracks
 * @param {readonly string[]} takenCourseNames
 * @returns {Set<string>}
 */
export function detectCompletedTrackKeys(tracks, takenCourseNames) {
  const taken = new Set(takenCourseNames.map((name) => normalizeCourseName(name)));
  const nameMap = coreTrackNameMap(tracks);
  const completed = new Set();
  for (const track of tracks) {
    const names = nameMap.get(track.key) ?? new Set();
    for (const name of names) {
      if (taken.has(name)) {
        completed.add(track.key);
        break;
      }
    }
  }
  return completed;
}

/**
 * 트랙 목록에 등장하는 순서대로 영역 구분(공통필수/공통선택 등)을 뽑습니다.
 * @param {readonly CoreTrack[]} tracks
 */
export function trackGroupsOf(tracks) {
  const groups = [];
  for (const track of tracks) {
    const found = groups.find((group) => group.group === track.group);
    if (found) found.count += 1;
    else groups.push({ group: track.group, count: 1 });
  }
  return groups;
}
