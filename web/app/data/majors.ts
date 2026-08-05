import designedMajorsJson from "./designed-majors.generated.json";

export type LinkedMajor = {
  key: string;
  label: string;
  shortLabel: string;
  color: string;
  softColor: string;
  codes: readonly string[];
  sourceUrl: string;
  verifiedAt: string;
};

export const linkedMajors: readonly LinkedMajor[] = [
  {
    key: "BDS",
    label: "빅데이터사이언스 연계전공",
    shortLabel: "빅데이터",
    color: "#861f1c",
    softColor: "#f7eceb",
    sourceUrl: "https://bds.sogang.ac.kr/bds/bds02_1.html",
    verifiedAt: "2026-08-04",
    codes: [
      "STS2011", "MAT2110", "MAT3020", "MGT2002", "ECO2004",
      "BDS4010", "CSW4010", "CSE4187", "AIC4012", "BDS3010", "BDS3020",
      "CSE4130", "CSW2010", "CSW2020", "CSW2030", "CSE3080", "CSW2050",
      "CSW3010", "CSE3081", "CSW3030", "CSE4110", "CSW3060", "CSW3080",
      "CSW4020", "ECO2009", "ECO3022", "ECO3023", "ECO4003", "ECO4004",
      "ECO4032", "EEE4178", "JAS4014", "MAS1004", "MAS2009", "MAS2010",
      "MAT3110", "MAT4331", "MGT4202", "MGT4208", "MGT4226", "MGT4515",
      "MGT4517", "MGT6613", "MGTG613",
    ],
  },
  {
    key: "PUB",
    label: "공공인재 연계전공",
    shortLabel: "공공인재",
    color: "#6f9453",
    softColor: "#eef3e9",
    sourceUrl: "https://www.sogang.ac.kr/ko/academic-support/college-bulletin",
    verifiedAt: "2026-08-04",
    codes: [
      "PUB2005", "POL3130", "POL2002", "SOC2001", "SOC2003", "SOC3010",
      "ECO2001", "ECO2002", "ECO3009", "ECO3011", "ECO3017", "MGT2002",
      "MGT2003", "PHI2005", "PSY2001", "PSY3009", "PUB3030", "PUB3016",
      "PUB3029", "PUB3023", "PUB3024", "PUB3025", "PUB3031", "PUB3032",
      "PUB3026", "PUB3021", "PUB3020", "PUB3022", "PUB3028", "PUB3027",
      "PUB4009", "KOR4500", "EDU2001", "PHI4010", "ECO2007", "MGT3004",
      "MGT4301", "MGT3005", "MGT4404",
    ],
  },
  {
    key: "EDU",
    label: "교육문화 연계전공",
    shortLabel: "교육문화",
    color: "#004f8e",
    softColor: "#e6edf4",
    sourceUrl: "https://www.sogang.ac.kr/ko/academic-support/college-bulletin",
    verifiedAt: "2026-08-04",
    codes: [
      "EDU2001", "EDU2002", "EDU2003", "EDU2004", "EDU3001", "EDU3047",
      "EDU3002", "EDU3033", "EDU3045", "EDU3046", "EDU3037", "EDU3004",
      "EDU3035", "EDU2005", "EDU2007", "EDU3038", "EDU3039", "EDU3048",
      "EDU3049", "SHU4019", "SHU4022", "SHU4031", "EDU3036",
    ],
  },
  {
    key: "SPM",
    label: "스포츠미디어 연계전공",
    shortLabel: "스포츠미디어",
    color: "#e3540b",
    softColor: "#fceee6",
    sourceUrl: "https://www.sogang.ac.kr/ko/academic-support/college-bulletin",
    verifiedAt: "2026-08-04",
    codes: [
      "MAE3014", "MAS2004", "MAE3001", "MAS3001", "JAS3001", "JAS3012",
      "JAS3005", "JAS4015", "JAS4014", "JAS3002", "JAS3007", "JAS2008",
      "JAS4011", "JAS3010", "MAE2001", "MAE3002", "MAE3003", "MAE3009",
      "MAE3035", "SPM3001", "SPM3004", "SPM3005", "SPM3006", "SPM3007",
      "SPM3008", "SPM3009", "SPM3010", "SPM3011", "SPM3012", "SPM3013",
      "SPM3014", "SPM3015", "SPM3101", "SPM3102", "SPM3103", "SPM3104",
      "SPM3105", "SPM3106", "SPM3107", "SPM3108", "SPM3110", "SPM3111",
      "SPM3112", "SPM3113", "SPM3114", "SPM3115", "SPM3116", "SPM3117",
      "SPM3118", "SPM3119", "SPM3120",
    ],
  },
] as const;

export type DesignedMajor = {
  /** 과목이수표에 적힌 설계전공명 (예: 「영상서사창작」) */
  name: string;
  /** 선택 목록에 뜨는 이름. 학과·연계전공과 섞이지 않게 제도 이름을 붙인다 */
  label: string;
  /** 승인 시점 (「2026학년도1학기」처럼 안내 페이지 표기를 그대로 둔다) */
  approvedAt: string;
  /** 전공구성 — 어느 학과 과목을 모아 만든 전공인지 */
  composition: string;
  codes: readonly string[];
};

/**
 * 학생설계전공. 학생이 여러 학과 과목을 모아 직접 설계해 승인받는 전공이라
 * 연계전공과 마찬가지로 학과명으로는 과목을 찾을 수 없고 과목코드로만 묶입니다.
 *
 * 과목이수표는 요람이 아니라 「학생설계전공 승인 현황」 페이지의 전공별 첨부파일에 있어
 * `scripts/import-designed-majors.py`가 그 파일들을 읽어 코드를 뽑습니다.
 *
 * 과목코드 열이 생기기 전(1998~2006 승인)의 과목표는 과목명만 적혀 있어 코드를 만들 수
 * 없습니다. 그 5개는 여기서 걸러냅니다 — 아무 과목도 표시하지 못하는 선택지를 주는 쪽이
 * 목록에서 빼는 쪽보다 나쁩니다. (해당 학번은 이미 졸업했습니다)
 */
export const designedMajors: readonly DesignedMajor[] = designedMajorsJson.majors
  .filter((major) => major.codes.length > 0)
  .map((major) => ({
    name: major.name,
    label: `${major.name} 학생설계전공`,
    approvedAt: major.approvedAt,
    composition: major.composition,
    codes: major.codes,
  }));

export const designedMajorSource = {
  label: "학생설계전공 승인 현황",
  sourceUrl: designedMajorsJson.sourceUrl,
  verifiedAt: "2026-08-05",
};

/**
 * 과목코드로만 묶이는 전공(연계전공 + 학생설계전공).
 * 학과는 개설과목의 「학과」 열로 찾지만 이 전공들은 그 열에 나오지 않아 코드로 찾아야 합니다.
 */
export const codeBasedMajors: readonly { label: string; codes: readonly string[] }[] = [
  ...linkedMajors.map((major) => ({ label: major.label, codes: major.codes })),
  ...designedMajors.map((major) => ({ label: major.label, codes: major.codes })),
];

export const officialSources = {
  bulletin: "https://www.sogang.ac.kr/ko/academic-support/college-bulletin",
  courses:
    "https://sis109.sogang.ac.kr/sap/bc/webdynpro/sap/zcmw9016?sap-language=KO#",
  designedMajors: designedMajorsJson.sourceUrl,
};

