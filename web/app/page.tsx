"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import bundledCourses from "./data/courses.generated.json";
import bundledMeta from "./data/courses.generated.meta.json";
import { codeBasedMajors, designedMajorSource, officialSources } from "./data/majors";
import ProfileSetup, { type UserProfile } from "./components/ProfileSetup";
import FeedbackLauncher from "./components/FeedbackLauncher";
import { postEvent } from "./lib/track.mjs";
import { extractEverytimeUrl } from "./lib/everytime-link.mjs";
import { groupTimetableEntries } from "./lib/timetable-layout.mjs";
import { hourMarks, layoutCalendar } from "./lib/calendar-layout.mjs";
import { normalizeCourseName } from "./lib/course-name.mjs";
import { expandEquivalents, equivalentLabel } from "./data/equivalents.mjs";
import { affiliationsOf, checkEligibility } from "./data/affiliations.mjs";
import { majorsWithPreMajor, preMajorCodeMap, preMajorSource } from "./data/pre-major.mjs";
import {
  LAST_BULLETIN_YEAR,
  bulletinYearFor,
  collegeByKey,
  coreCurriculumSource,
  coreTrackCodeMap,
  coreTracksFor,
  detectCompletedTrackKeys,
  trackGroupsOf,
} from "./data/core-curriculum.mjs";

type Course = (typeof bundledCourses)[number];
type ImportedCourse = { name: string; professor: string; room: string };
type ImportedTerm = { semester: string; courses: ImportedCourse[]; available?: boolean };
type Meeting = { day: string; start: number; end: number };
type CoreTrack = ReturnType<typeof coreTracksFor>[number];

const DAY_LIST = ["월", "화", "수", "목", "금"] as const;
/** 담은 과목은 브라우저에만 둡니다 (서버로 보내지 않음) */
const PICKED_STORAGE_KEY = "coursecheck_picked";
/** 도움이 됐는지 한 번 답하면 다시 묻지 않는다 */
const HELPFUL_STORAGE_KEY = "coursecheck_helpful";
/** 빌드 시각은 ISO 문자열 그대로 둔다 — 서버와 브라우저의 표시 형식이 달라지면 하이드레이션이 어긋난다 */
const buildStampTitle = `빌드 ${process.env.NEXT_PUBLIC_BUILD_TIME ?? "시각 미상"}`;
/** 자료 기준일. 시간대를 고정해야 서버와 브라우저가 같은 날짜를 찍는다 */
const dataDateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

function dataDateLabel(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${dataDateFormat.format(date)} 기준`;
}
/** 과목을 무엇으로 듣는지에 따른 색. 서강대 UI 메인·서브 컬러에서 골랐습니다. */
const CATEGORIES = [
  { key: "major1", label: "1전공", color: "#861f1c" },
  { key: "major2", label: "2전공", color: "#004f8e" },
  { key: "major3", label: "3전공", color: "#6f9453" },
  { key: "coreGE", label: "필수교양", color: "#e3540b" },
  { key: "freeGE", label: "자유교양", color: "#5c2976" },
] as const;
const CATEGORY_COLOR = new Map(CATEGORIES.map((item) => [item.key, item.color]));
const CATEGORY_LABEL = new Map(CATEGORIES.map((item) => [item.key, item.label]));
/** 교양을 개설하는 기관 — 필수 트랙에 없으면 자유교양으로 본다 */
const GENERAL_EDUCATION_DEPARTMENTS = ["전인교육원", "융합교육원"];
/** 교양을 얼마나 보여줄지 */
const GE_MODES = [
  { key: "all", label: "전체", hint: "필수교양 + 자유교양" },
  { key: "core", label: "필수만", hint: "남은 필수 교양 영역만" },
  { key: "none", label: "전공만", hint: "교양 없이 전공 과목만" },
] as const;
type GeMode = (typeof GE_MODES)[number]["key"];

function compactSemester(value: string) {
  const match = value.match(/(\d{4}).*?(1|2|여름|겨울)\s*학기/);
  return match ? `${match[1]}-${match[2]}` : value || "가져온 시간표";
}

function semesterOrder(value: string) {
  const match = value.match(/(\d{4})-(1|2|여름|겨울)/);
  if (!match) return 0;
  const termOrder = { "1": 1, "여름": 2, "2": 3, "겨울": 4 }[match[2]] ?? 0;
  return Number(match[1]) * 10 + termOrder;
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function formatMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function parseMeetings(schedule: string): Meeting[] {
  const meetings: Meeting[] = [];
  const pattern = /([월화수목금토일](?:\s*,\s*[월화수목금토일])*)\s*(\d{1,2}:\d{2})\s*[~-]\s*(\d{1,2}:\d{2})/g;
  for (const match of schedule.matchAll(pattern)) {
    const start = minutes(match[2]);
    const end = minutes(match[3]);
    for (const day of match[1].split(",").map((item) => item.trim())) {
      if (DAY_LIST.includes(day as (typeof DAY_LIST)[number])) meetings.push({ day, start, end });
    }
  }
  return meetings;
}

/**
 * 영어강의인지. 관리 화면에서 이 열이 생기기 전에 올린 자료에는 값이 없으므로 true만 영어강의로 본다.
 */
function isEnglish(course: Course) {
  return course.english === true;
}

/** 전공 순번(1·2·3전공)별로 과목 코드와 학과를 찾을 표를 만든다 */
function majorRankIndex(majors: string[]) {
  const byCode = new Map<string, number>();
  const byDepartment = new Map<string, number>();
  majors.forEach((major, index) => {
    const rank = index + 1;
    // 연계전공·학생설계전공은 개설과목의 「학과」 열에 나오지 않아 과목코드로 찾는다
    const byCodeMajor = codeBasedMajors.find((item) => item.label === major);
    if (byCodeMajor) {
      for (const code of byCodeMajor.codes) if (!byCode.has(code)) byCode.set(code, rank);
    } else if (!byDepartment.has(major)) {
      byDepartment.set(major, rank);
    }
  });
  // 전공입문교과는 남의 학과가 여는 경우가 많아(미적분학Ⅱ는 전인교육원, 화학전공의 일반물리는
  // 물리학과) 학과 이름으로는 잡히지 않는다. 과목코드로 따로 찾고, 위 두 표가 못 잡은 것만 채운다.
  const byPreMajorCode = preMajorCodeMap(majors) as Map<string, { rank: number; major: string; rule: string }>;
  return { byCode, byDepartment, byPreMajorCode };
}

type MajorRanks = ReturnType<typeof majorRankIndex>;

/** 이 과목을 무엇으로 듣는지 — 전공(1·2·3) 판정 한 곳. 전공입문이면 어떤 조건인지도 함께 준다 */
function majorMatch(course: Course, ranks: MajorRanks) {
  const direct = ranks.byCode.get(course.code) ?? ranks.byDepartment.get(course.department);
  if (direct) return { rank: direct, preMajor: null };
  const preMajor = ranks.byPreMajorCode.get(course.code);
  return preMajor ? { rank: preMajor.rank, preMajor } : { rank: undefined, preMajor: null };
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"timetable" | "list" | "mine">("timetable");
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  /** 관리 화면에서 올린 자료가 있으면 그것을 쓰고, 없으면 빌드에 포함된 기본 자료를 쓴다 */
  const [uploaded, setUploaded] = useState<{ semester: string; courses: Course[]; uploadedAt?: string } | null>(null);
  const [everytimeUrl, setEverytimeUrl] = useState("");
  const [importedTerms, setImportedTerms] = useState<ImportedTerm[]>([]);
  const [activeImportedTerm, setActiveImportedTerm] = useState("");
  const [includedTakenNames, setIncludedTakenNames] = useState<string[]>([]);
  const [manualTrackState, setManualTrackState] = useState<Record<string, boolean>>({});
  const [excludedMajorRanks, setExcludedMajorRanks] = useState<number[]>([]);
  const [geMode, setGeMode] = useState<GeMode>("core");
  /** 영어강의 요건이 남은 사람이 영어강의만 눈으로 골라낼 수 있게 하는 강조 (기본 꺼짐) */
  const [highlightEnglish, setHighlightEnglish] = useState(false);
  const [manualExcludeInput, setManualExcludeInput] = useState("");
  const [manualExcludedCourses, setManualExcludedCourses] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [importMessage, setImportMessage] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [helpfulVote, setHelpfulVote] = useState<"yes" | "no" | null>(null);
  const viewed = useRef(false);
  const pickedRestored = useRef(false);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      postEvent("page_view");
    }
  }, []);

  // 이미 답한 사람에게 다시 묻지 않는다 (브라우저 전용)
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = window.localStorage.getItem(HELPFUL_STORAGE_KEY);
        if (saved === "yes" || saved === "no") setHelpfulVote(saved);
      } catch {
        // 저장 공간이 막혀 있어도 화면 동작은 유지한다
      }
    });
    return () => { cancelled = true; };
  }, []);

  // 담은 과목 복원·저장 (브라우저 전용).
  // 복원이 끝나기 전에는 저장하지 않는다 — 첫 렌더의 빈 배열이 저장값을 지우기 때문.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(window.localStorage.getItem(PICKED_STORAGE_KEY) ?? "[]");
        if (Array.isArray(saved)) setPickedIds(saved.filter((id) => typeof id === "string"));
      } catch {
        // 저장된 값이 깨졌으면 무시한다
      }
      pickedRestored.current = true;
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!pickedRestored.current) return;
    try {
      window.localStorage.setItem(PICKED_STORAGE_KEY, JSON.stringify(pickedIds));
    } catch {
      // 저장 공간이 막혀 있어도 화면 동작은 유지한다
    }
  }, [pickedIds]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/courses")
      .then((response) => (response.status === 204 ? null : response.json()))
      .then((data) => {
        if (cancelled || !data?.courses?.length) return;
        setUploaded({ semester: data.semester, courses: data.courses as Course[], uploadedAt: data.uploadedAt });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void fetch("/api/profile", { cache: "no-store" })
      .then((response) => response.json())
      .then((profileData) => {
        const savedProfile = profileData.profile as UserProfile | null;
        setProfile(savedProfile);
        setProfileOpen(!savedProfile);
      })
      .catch(() => setProfileOpen(true))
      .finally(() => setProfileLoading(false));
  }, []);

  function profileSaved(savedProfile: UserProfile) {
    setProfile(savedProfile);
    setProfileOpen(false);
    setShowResults(false);
    setExcludedMajorRanks([]);
    postEvent("profile_saved");
  }

  const courses: Course[] = uploaded?.courses ?? bundledCourses;
  const semesterLabel = uploaded?.semester ?? bundledMeta.semester;
  const dataDate = dataDateLabel(uploaded?.uploadedAt ?? bundledMeta.generatedAt);

  const profileMajors = useMemo(
    () => profile ? [profile.major1, profile.major2, profile.major3].filter(Boolean) as string[] : [],
    [profile],
  );
  const activeTerm = importedTerms.find((term) => term.semester === activeImportedTerm) ?? importedTerms[0];
  const includedTakenSet = useMemo(() => new Set(includedTakenNames), [includedTakenNames]);
  const allImportedCourses = useMemo(() => importedTerms.flatMap((term) => term.courses), [importedTerms]);
  // 이수로 볼 과목: 가져온 수강 내역에서 사용자가 되살리지 않은 것 + 직접 추가한 것
  const takenForExclusion = useMemo(() => {
    const fromImport = allImportedCourses.filter(
      (course) => !includedTakenSet.has(normalizeCourseName(course.name)),
    );
    return [...fromImport, ...manualExcludedCourses.map((name) => ({ name }))];
  }, [allImportedCourses, includedTakenSet, manualExcludedCourses]);
  // 요람이 「택1」로 묶은 과목은 하나만 들었어도 나머지까지 함께 제외한다.
  // 묶음 중에는 한 전공의 전공입문 규정인 것이 있어 내 전공을 함께 넘긴다.
  const equivalents = useMemo(
    () => expandEquivalents(takenForExclusion, courses, profileMajors),
    [takenForExclusion, courses, profileMajors],
  );
  /** 내가 실제로 들은(또는 직접 적은) 과목 */
  const takenNames = useMemo(
    () => new Set(takenForExclusion.map((course) => normalizeCourseName(course.name))),
    [takenForExclusion],
  );
  /** 「택1」 묶음으로 넓힌 과목 — 추정이므로 전공입문 필수 과목까지 지우지는 않는다 */
  const equivalentNames = useMemo(
    () => new Set<string>([...equivalents.names].filter((name: string) => !takenNames.has(name))),
    [equivalents, takenNames],
  );
  const courseNameOptions = useMemo(
    () => [...new Set(courses.map((course) => course.name))].sort((a, b) => a.localeCompare(b, "ko")),
    [courses],
  );

  const bulletinYear = bulletinYearFor(profile?.cohortYear ?? LAST_BULLETIN_YEAR);
  const collegeKey = profile?.college ?? null;
  const college = collegeByKey(collegeKey) as { label: string; stream: string } | null;
  const coreTracks: CoreTrack[] = useMemo(
    () => coreTracksFor(bulletinYear, collegeKey),
    [bulletinYear, collegeKey],
  );
  const trackGroups: Array<{ group: string; count: number }> = useMemo(() => trackGroupsOf(coreTracks), [coreTracks]);
  const autoCompletedTracks = useMemo(
    () => detectCompletedTrackKeys(coreTracks, allImportedCourses.map((course) => course.name)),
    [coreTracks, allImportedCourses],
  );
  const completedTrackKeys = useMemo(
    () => new Set(
      coreTracks
        .filter((track) => manualTrackState[track.key] ?? autoCompletedTracks.has(track.key))
        .map((track) => track.key),
    ),
    [coreTracks, manualTrackState, autoCompletedTracks],
  );
  const trackByCode = useMemo(() => coreTrackCodeMap(coreTracks), [coreTracks]);
  const trackByKey = useMemo(
    () => new Map<string, CoreTrack>(coreTracks.map((track) => [track.key, track])),
    [coreTracks],
  );
  const trackOfferingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const course of courses) {
      const key = trackByCode.get(course.code);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [courses, trackByCode]);
  const remainingTrackCount = coreTracks.length - completedTrackKeys.size;

  /** 복전 신청을 마친 전공만 소속으로 인정한다 (1전공은 항상 인정) */
  const affiliations = useMemo(() => affiliationsOf({
    cohortYear: profile?.cohortYear,
    majors: profileMajors.map((name, index) => ({
      name,
      rank: index + 1,
      approved: index === 0 || (index === 1 ? profile?.major2Approved !== false : profile?.major3Approved !== false),
    })),
  }, college?.label ?? null) as { any: Set<string>; firstMajor: Set<string> }, [profile, profileMajors, college]);

  const filteredCourses = useMemo(() => {
    const ranks = majorRankIndex(profileMajors);
    const normalizedQuery = query.trim().toLowerCase();

    return courses.filter((course) => {
      const trackKey = trackByCode.get(course.code);
      // 전공으로 듣는 과목이면 그 순번을, 아니면 교양 구분을 본다
      const { rank, preMajor } = majorMatch(course, ranks);
      // 이수한 필수교양 영역의 과목은 뺀다 — 단 전공으로도 인정되는 과목은 남긴다.
      // 연계·학생설계전공 과목표에는 교양으로 개설되는 과목이 들어 있어(문화비평학의 STU4011 등)
      // 영역을 이미 채웠어도 그 과목으로 채울 전공 학점은 그대로 남아 있습니다.
      if (!rank && trackKey && completedTrackKeys.has(trackKey)) return false;
      const name = normalizeCourseName(course.name);
      if (takenNames.has(name)) return false;
      // 「택1」 묶음 확장은 추정이라 전공입문 필수 과목에는 걸지 않는다 — 미적분학Ⅰ을 필수선택으로
      // 들었다고 해서 전공입문인 미적분학Ⅱ까지 사라지면 안 된다
      if (!preMajor && equivalentNames.has(name)) return false;
      // 소속 제한으로 신청할 수 없는 과목은 뺀다 (판정할 수 없으면 남긴다)
      if (!checkEligibility(course.note ?? "", affiliations).eligible) return false;

      if (rank) {
        if (excludedMajorRanks.includes(rank)) return false;
      } else if (trackKey) {
        if (geMode === "none") return false;
      } else if (GENERAL_EDUCATION_DEPARTMENTS.includes(course.department)) {
        if (geMode !== "all") return false;
      } else {
        return false;
      }

      return !normalizedQuery || `${course.name} ${course.code} ${course.professor}`.toLowerCase().includes(normalizedQuery);
    });
  }, [courses, profileMajors, query, takenNames, equivalentNames, trackByCode, completedTrackKeys, excludedMajorRanks, geMode, affiliations]);

  const timetableSlots = useMemo(() => groupTimetableEntries(
    filteredCourses.flatMap((course) => parseMeetings(course.schedule).map((meeting) => ({ course, meeting }))),
    DAY_LIST,
  ) as Array<{
    start: number;
    end: number;
    byDay: Record<string, Array<{ course: Course; meeting: Meeting }>>;
  }>, [filteredCourses]);
  const hiddenTakenCount = useMemo(() => {
    const ranks = majorRankIndex(profileMajors);
    return courses.filter((course) => {
      const name = normalizeCourseName(course.name);
      if (takenNames.has(name)) return true;
      return equivalentNames.has(name) && !majorMatch(course, ranks).preMajor;
    }).length;
  }, [courses, profileMajors, takenNames, equivalentNames]);
  // 범례에는 실제로 결과에 있는 구분만 보여준다
  const shownCategories = useMemo(() => {
    const ranks = majorRankIndex(profileMajors);
    const keys = new Set<string>();
    for (const course of filteredCourses) {
      const { rank } = majorMatch(course, ranks);
      if (rank) keys.add(`major${rank}`);
      else if (trackByCode.has(course.code)) keys.add("coreGE");
      else if (GENERAL_EDUCATION_DEPARTMENTS.includes(course.department)) keys.add("freeGE");
    }
    return keys;
  }, [filteredCourses, profileMajors, trackByCode]);

  /**
   * 관리 화면에 영어강의 열이 생기기 전에 올린 자료로 보고 있으면 켤 것이 없다.
   * 그때는 「영어강의 강조 0」을 띄우지 않고 스위치 자체를 감춘다.
   */
  const hasEnglishData = useMemo(() => courses.some(isEnglish), [courses]);
  /** 결과에 영어강의가 몇 개인지 — 강조를 켜기 전에도 켤 만한지 보이게 스위치에 함께 적는다 */
  const englishCount = useMemo(() => filteredCourses.filter(isEnglish).length, [filteredCourses]);

  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds]);
  const pickedCourses = useMemo(
    () => pickedIds.map((id) => courses.find((course) => course.id === id)).filter(Boolean) as Course[],
    [pickedIds, courses],
  );
  const pickedCredits = useMemo(
    () => pickedCourses.reduce((total, course) => total + (course.credits || 0), 0),
    [pickedCourses],
  );
  const myCalendar = useMemo(() => layoutCalendar(
    pickedCourses.flatMap((course) => parseMeetings(course.schedule).map((meeting) => ({ course, meeting }))),
    DAY_LIST,
  ) as {
    startMin: number;
    endMin: number;
    rows: number;
    conflictCount: number;
    byDay: Record<string, { lanes: number; blocks: Array<{ entry: { course: Course; meeting: Meeting }; lane: number; conflict: boolean; rowStart: number; rowSpan: number }> }>;
  }, [pickedCourses]);
  const myCalendarMarks = useMemo(
    () => hourMarks(myCalendar.startMin, myCalendar.endMin) as Array<{ time: number; row: number }>,
    [myCalendar],
  );
  /** 시간이 정해지지 않아 캘린더에 못 놓는 담은 과목 */
  const pickedWithoutTime = useMemo(
    () => pickedCourses.filter((course) => parseMeetings(course.schedule).length === 0),
    [pickedCourses],
  );

  const majorRanks = useMemo(() => majorRankIndex(profileMajors), [profileMajors]);
  /** 전공입문교과가 요람에 실린 내 전공 (안내 문구에 쓴다) */
  const preMajorMajors = useMemo(() => majorsWithPreMajor(profileMajors) as string[], [profileMajors]);
  /** 전공 순번별로 이번 학기 개설 과목이 몇 개인지 (제외 체크박스에 표시) */
  const majorCourseCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const course of courses) {
      const { rank } = majorMatch(course, majorRanks);
      if (rank) counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    return counts;
  }, [courses, majorRanks]);

  /** 이 과목을 무엇으로 듣는지 — 1·2·3전공 > 필수교양 > 자유교양 순으로 판정 */
  function categoryOf(course: Course) {
    const { rank } = majorMatch(course, majorRanks);
    if (rank) return `major${rank}`;
    if (trackByCode.has(course.code)) return "coreGE";
    if (GENERAL_EDUCATION_DEPARTMENTS.includes(course.department)) return "freeGE";
    return "";
  }

  /** 전공입문으로 잡힌 과목이면 어느 전공의 어떤 조건인지 */
  function preMajorOf(course: Course) {
    return majorMatch(course, majorRanks).preMajor;
  }

  function colorFor(course: Course) {
    return CATEGORY_COLOR.get(categoryOf(course) as never) ?? "#7d7d7d";
  }

  function categoryLabelFor(course: Course) {
    return CATEGORY_LABEL.get(categoryOf(course) as never) ?? "";
  }

  function trackLabelFor(course: Course) {
    return trackByKey.get(trackByCode.get(course.code) ?? "")?.label ?? "";
  }

  /** 카드에 붙는 「1전공 · 전공입문」류 꼬리표 */
  function roleLabelFor(course: Course) {
    return [categoryLabelFor(course), preMajorOf(course) ? "전공입문" : "", trackLabelFor(course)]
      .filter(Boolean)
      .join(" · ");
  }

  function togglePicked(course: Course) {
    setPickedIds((current) =>
      current.includes(course.id) ? current.filter((id) => id !== course.id) : [...current, course.id],
    );
    postEvent("course_pick");
  }

  function toggleMajorRank(rank: number, excluded: boolean) {
    setExcludedMajorRanks((current) =>
      excluded ? [...new Set([...current, rank])] : current.filter((item) => item !== rank),
    );
    setShowResults(false);
  }

  function changeGeMode(mode: GeMode) {
    setGeMode(mode);
    postEvent("ge_mode", mode);
  }

  function changeEnglishHighlight(on: boolean) {
    setHighlightEnglish(on);
    postEvent("english_highlight", on ? "on" : "off");
  }

  function toggleTrack(trackKey: string, completed: boolean) {
    setManualTrackState((current) => ({ ...current, [trackKey]: completed }));
    setShowResults(false);
  }

  async function importEverytime(event: FormEvent) {
    event.preventDefault();
    setImportState("loading");
    setImportMessage("");
    try {
      const response = await fetch("/api/everytime", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: everytimeUrl }),
      });
      const data = (await response.json()) as {
        terms?: ImportedTerm[];
        courses?: ImportedCourse[];
        semester?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "시간표를 가져오지 못했어요.");
      const importedTermsFromLink = (data.terms?.length
        ? data.terms
        : [{ semester: data.semester ?? "", courses: data.courses ?? [], available: true }])
        .map((term) => ({ ...term, semester: compactSemester(term.semester) }));
      setImportedTerms((current) => {
        const bySemester = new Map(current.map((term) => [term.semester, term]));
        importedTermsFromLink.forEach((term) => bySemester.set(term.semester, term));
        return [...bySemester.values()].sort((a, b) => semesterOrder(b.semester) - semesterOrder(a.semester));
      });
      setActiveImportedTerm(importedTermsFromLink[0]?.semester ?? "");
      setEverytimeUrl("");
      setShowResults(false);
      setImportState("done");
      const importedCourseCount = importedTermsFromLink.reduce((sum, term) => sum + term.courses.length, 0);
      setImportMessage(`${importedTermsFromLink.length}개 학기에서 ${importedCourseCount}개 수강 과목을 가져왔어요.`);
      postEvent("everytime_import", importedCourseCount === 0 ? "0" : importedCourseCount <= 5 ? "1-5" : "6+");
    } catch (error) {
      setImportState("error");
      setImportMessage(error instanceof Error ? error.message : "시간표를 가져오지 못했어요.");
      postEvent("everytime_import_error");
    }
  }

  function toggleImportedCourse(courseName: string, shouldExclude: boolean) {
    const normalized = normalizeCourseName(courseName);
    setIncludedTakenNames((current) => shouldExclude
      ? current.filter((name) => name !== normalized)
      : [...new Set([...current, normalized])]);
    setShowResults(false);
  }

  function addManualExclusion(event: FormEvent) {
    event.preventDefault();
    const name = manualExcludeInput.trim();
    if (!name || manualExcludedCourses.some((course) => normalizeCourseName(course) === normalizeCourseName(name))) return;
    setManualExcludedCourses((current) => [...current, name]);
    setManualExcludeInput("");
    setShowResults(false);
  }

  function voteHelpful(vote: "yes" | "no") {
    setHelpfulVote(vote);
    try {
      window.localStorage.setItem(HELPFUL_STORAGE_KEY, vote);
    } catch {
      // 저장 공간이 막혀 있어도 화면 동작은 유지한다
    }
    postEvent("helpful_vote", vote);
    // 아쉬웠다면 무엇이 아쉬웠는지 바로 받을 수 있게 건의 창을 연다
    if (vote === "no") setFeedbackOpen(true);
  }

  function revealResults() {
    setShowResults(true);
    postEvent("results_view", filteredCourses.length === 0 ? "0" : filteredCourses.length <= 25 ? "1-25" : "26+");
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CourseCheck 처음으로"><span className="brand-mark">C</span><span><strong>CourseCheck</strong><small>SOGANG</small></span></a>
        <div className="header-actions">
          {profile && <button className="profile-edit" type="button" onClick={() => setProfileOpen(true)}>{String(profile.cohortYear).slice(2)}학번 · {profile.completedSemesters}학기 <span>수정</span></button>}
          <div className="header-meta"><span className="live-dot" />{semesterLabel} 개설과목 {courses.length.toLocaleString("ko-KR")}과목{dataDate && ` · ${dataDate}`}</div>
        </div>
      </header>

      <section className="hero" id="top">
        <div><p className="eyebrow">전공은 복잡해도, 시간표는 한눈에</p><h1>나에게 남은 과목들로{" "}<br className="wide-break" />이번 학기 시간표를 그려보세요.</h1><p className="hero-copy">학과 코드만으로 찾기 어려운 연계전공·학생설계전공 과목까지 과목이수표 기준으로 모았습니다.{" "}<br className="wide-break" />들었던 과목은 에브리타임 링크로 한 번에 제외할 수 있어요.</p></div>
      </section>

      <div className="workspace">
        <aside className="control-panel" aria-label="시간표 설정">
          <div className="panel-profile">
            <div><span>{profile ? `${String(profile.cohortYear).slice(2)}학번` : "학번"}</span><span>{profile ? `${profile.completedSemesters}학기 이수` : "이수학기"}</span></div>
            <p>{[college?.label, ...profileMajors].filter(Boolean).join(" · ") || "전공을 선택해 주세요"}</p>
            <button type="button" onClick={() => setProfileOpen(true)}>전공 수정</button>
          </div>

          <section className="control-section exclusion-section">
            <div className="section-heading"><span className="step">1</span><div><strong>들은 과목 제외하기</strong><small>선택 사항 · 과목별로 바꿀 수 있어요</small></div></div>
            <p className="semester-help">공유 링크 하나로 공개된 이전 학기 시간표까지 모두 가져와 학기별 탭에 모아드려요.</p>
            <form onSubmit={importEverytime} className="import-form">
              <label htmlFor="everytime-url">에브리타임 공유 링크 또는 복사한 문구</label>
              <input id="everytime-url" inputMode="url" autoComplete="off" placeholder="공유 문구 전체를 그대로 붙여넣으세요" value={everytimeUrl} onChange={(event) => setEverytimeUrl(extractEverytimeUrl(event.target.value))} required />
              <button className="primary-button" disabled={importState === "loading"}>{importState === "loading" ? "전체 학기 확인하는 중…" : importedTerms.length ? "수강 내역 다시 가져오기" : "전체 수강 내역 가져오기"}</button>
            </form>
            {importMessage && <p className={`import-message ${importState}`} role="status">{importMessage}</p>}

            {profileMajors.length > 0 && (
              <div className="major-exclusion">
                <p className="major-exclusion-label">전공 단위로 한 번에 제외<small>이미 그 전공을 다 이수했다면 체크하세요</small></p>
                <div className="major-exclusion-list">
                  {profileMajors.map((major, index) => {
                    const rank = index + 1;
                    const excluded = excludedMajorRanks.includes(rank);
                    const count = majorCourseCounts.get(rank) ?? 0;
                    return (
                      <label key={`${major}-${rank}`} className={excluded ? "major-exclusion-item excluded" : "major-exclusion-item"}>
                        <input
                          type="checkbox"
                          checked={excluded}
                          onChange={(event) => toggleMajorRank(rank, event.target.checked)}
                        />
                        <span>
                          <strong style={{ color: excluded ? undefined : CATEGORY_COLOR.get(`major${rank}` as never) }}>{rank}전공 과목 제외</strong>
                          <small>{major} · 이번 학기 {count}과목</small>
                        </span>
                        <em>{excluded ? "제외" : "포함"}</em>
                      </label>
                    );
                  })}
                </div>
                {preMajorMajors.length > 0 && (
                  <p className="equivalent-note">
                    <strong>전공입문교과 반영</strong>
                    {preMajorMajors.join(" · ")}의 전공입문(전공예비) 과목은 다른 학과가 열더라도
                    그 전공 색으로 함께 보여드려요. {preMajorSource.bulletinYear}학년도 요람 기준입니다.
                  </p>
                )}
              </div>
            )}

            {importedTerms.length > 0 && (
              <div className="semester-history">
                <div className="semester-tabs" role="tablist" aria-label="가져온 학기">
                  {importedTerms.map((term) => <button key={term.semester} type="button" role="tab" aria-selected={activeTerm?.semester === term.semester} className={activeTerm?.semester === term.semester ? "active" : ""} onClick={() => setActiveImportedTerm(term.semester)}>{term.semester}<span>{term.courses.length}</span></button>)}
                </div>
                <div className="taken-course-list" role="tabpanel">
                  {activeTerm?.courses.length ? activeTerm.courses.map((course, index) => {
                    const excluded = !includedTakenSet.has(normalizeCourseName(course.name));
                    return <label key={`${course.name}-${course.professor}-${index}`}><input type="checkbox" checked={excluded} onChange={(event) => toggleImportedCourse(course.name, event.target.checked)} /><span><strong>{course.name}</strong><small>{course.professor || course.room || "상세 정보 없음"}</small></span><em>{excluded ? "제외" : "다시 표시"}</em></label>;
                  }) : <p>{activeTerm?.available === false ? "공개되지 않았거나 가져오지 못한 학기예요." : "이 학기에는 등록된 과목이 없어요."}</p>}
                </div>
              </div>
            )}

            <div className="manual-exclusion">
              <label htmlFor="manual-course">추가로 제외할 과목</label>
              <form onSubmit={addManualExclusion}><input id="manual-course" list="course-name-options" placeholder="과목명을 검색하거나 직접 입력" value={manualExcludeInput} onChange={(event) => setManualExcludeInput(event.target.value)} /><button type="submit">추가</button></form>
              <datalist id="course-name-options">{courseNameOptions.map((name) => <option key={name} value={name} />)}</datalist>
              {manualExcludedCourses.length > 0 && <div className="manual-course-tags">{manualExcludedCourses.map((name) => <button key={name} type="button" onClick={() => { setManualExcludedCourses((current) => current.filter((course) => course !== name)); setShowResults(false); }}>{name}<span>×</span></button>)}</div>}
            </div>

          </section>

          <section className="control-section core-section">
            <div className="section-heading"><span className="step">2</span><div><strong>필수 교양 이수 확인</strong><small>{bulletinYear}학년도 요람 기준 · {String(profile?.cohortYear ?? LAST_BULLETIN_YEAR).slice(2)}학번{college ? ` · ${college.label}` : ""}</small></div></div>
            <p className="semester-help">가져온 수강 내역으로 영역별 이수 여부를 먼저 추정했어요. 다르면 직접 체크해 주세요. <strong>이수한 영역은 시간표에서 빼고, 남은 영역의 과목은 함께 보여드려요.</strong></p>

            {trackGroups.map(({ group, count }) => (
              <div className="core-track-group" key={group}>
                <p className="core-group-label">{group}교과<span>{count}개 영역</span></p>
                <div className="core-track-list">
                  {coreTracks.filter((track) => track.group === group).map((track) => {
                    const completed = completedTrackKeys.has(track.key);
                    const offered = trackOfferingCounts.get(track.key) ?? 0;
                    return (
                      <label key={track.key} className={completed ? "core-track completed" : "core-track"}>
                        <input type="checkbox" checked={completed} onChange={(event) => toggleTrack(track.key, event.target.checked)} />
                        <span>
                          <strong style={{ color: completed ? undefined : CATEGORY_COLOR.get("coreGE") }}>{track.label}</strong>
                          <small>{track.credits} · {track.rule} · {offered > 0 ? `이번 학기 ${offered}과목` : "이번 학기 미개설"}</small>
                          {track.pinnedNote && <small className="core-pinned">{track.courses[0].name} — {track.pinnedNote}</small>}
                        </span>
                        {autoCompletedTracks.has(track.key) ? <em className="auto">수강 확인</em> : <em>{completed ? "이수" : "미이수"}</em>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            <p className="core-note">
              요람 〈별표 1〉에 지정된 과목만 판정해요.
              {college ? " 글쓰기 계열과 영역별 필수선택은 소속 대학 기준으로 자동 반영했습니다." : " 소속 대학을 입력하면 글쓰기 계열과 영역별 필수선택까지 자동으로 골라드려요."}
              {bulletinYear < 2019 && " 2018학번 이전 중핵필수선택은 모집단위별로 필수 영역이 달라, 어떤 영역을 이수해야 하는지는 요람을 확인해 주세요."}
              {" 편입·국제·장애학생 예외는 판정하지 않습니다."}
            </p>
            {equivalents.groups.size > 0 && (
              <p className="equivalent-note">
                <strong>요람 택1 묶음 반영</strong>
                {[...equivalents.groups].map((key: string) => equivalentLabel(key)).join(" · ")} 묶음은 하나만 들어도 나머지까지 함께 제외했어요.
              </p>
            )}
            <p className="privacy-note"><span>잠금</span> 이름·전체 학번·링크·IP는 저장하지 않습니다. 교양 체크 결과도 서버에 보내지 않아요.</p>
            <button className="show-results-button" type="button" onClick={revealResults}>개설 시간표 확인하기 <span>→</span></button>
          </section>

          <section className="source-card"><strong>데이터 출처</strong><a href={officialSources.bulletin} target="_blank" rel="noreferrer">서강대학교 대학요람 <span>↗</span></a><a href={officialSources.courses} target="_blank" rel="noreferrer">개설교과목정보 <span>↗</span></a><a href={officialSources.designedMajors} target="_blank" rel="noreferrer">{designedMajorSource.label} <span>↗</span></a><small>{coreCurriculumSource.label} · {coreCurriculumSource.verifiedAt} 확인</small><small>{designedMajorSource.label} · {designedMajorSource.verifiedAt} 확인</small></section>
        </aside>

        <section className="result-panel" aria-label="개설 과목 시간표" ref={resultsRef}>
          <div className="result-toolbar">
            <div><p className="semester-label">3 · {semesterLabel.replace("-", "학년도 ")}학기</p><h2>내 조건에 맞는 개설 시간표 {showResults && <span>{filteredCourses.length}과목</span>}</h2>{showResults && <small>{[hiddenTakenCount > 0 ? `${hiddenTakenCount}개 수강·추가 과목 제외됨` : "", remainingTrackCount > 0 ? `남은 필수 교양 ${remainingTrackCount}개 영역 포함` : "필수 교양 모두 이수"].filter(Boolean).join(" · ")}</small>}</div>
            {showResults && <div className="toolbar-actions"><div className="ge-switch" role="group" aria-label="교양 표시"><span className="ge-switch-label" aria-hidden="true">교양</span>{GE_MODES.map((mode) => <button key={mode.key} type="button" title={mode.hint} aria-pressed={geMode === mode.key} className={geMode === mode.key ? "active" : ""} onClick={() => changeGeMode(mode.key)}>{mode.label}</button>)}</div>{hasEnglishData && <label className={highlightEnglish ? "english-switch on" : "english-switch"} title="영어강의를 노란 윤곽선으로 표시합니다"><input type="checkbox" checked={highlightEnglish} onChange={(event) => changeEnglishHighlight(event.target.checked)} />영어강의 강조<em>{englishCount}</em></label>}<div className="category-legend" aria-label="색 구분">{CATEGORIES.filter((item) => shownCategories.has(item.key)).map((item) => <span key={item.key}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</span>)}</div><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="과목 검색" placeholder="과목명·교수·코드 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="view-toggle" aria-label="보기 방식"><button type="button" className={view === "timetable" ? "active" : ""} onClick={() => setView("timetable")} aria-label="교시별 후보 보기" title="교시별 후보">▦</button><button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="목록 보기" title="목록">☷</button><button type="button" className={view === "mine" ? "active mine" : "mine"} onClick={() => setView("mine")} aria-label="내 시간표 보기" title="내 시간표">내 시간표{pickedIds.length > 0 && <em>{pickedIds.length}</em>}</button></div></div>}
          </div>

          {!showResults ? (
            <div className="result-placeholder"><span>3</span><strong>조건을 확인하면 시간표가 열려요</strong><p>들은 과목과 필수 교양 이수 여부를 확인한 뒤<br />‘개설 시간표 확인하기’를 눌러주세요.</p></div>
          ) : filteredCourses.length === 0 ? (
            <div className="empty-state"><span>⌕</span><strong>조건에 맞는 과목이 없어요</strong><p>전공 정보를 수정하거나 제외 과목·이수 체크를 줄여보세요.</p></div>
          ) : view === "timetable" ? (
            <div className="timetable-scroll">
              <div className="timetable-matrix" role="table" aria-label="요일별 개설 시간표">
                <div className="matrix-head matrix-time-head" role="columnheader">시간</div>
                {DAY_LIST.map((day) => <div className="matrix-head" role="columnheader" key={day}>{day}요일</div>)}
                {timetableSlots.map((slot) => (
                  <div className="matrix-row" role="row" key={slot.start}>
                    <div className="matrix-time" role="rowheader"><strong>{formatMinutes(slot.start)}</strong><span>시작</span></div>
                    {DAY_LIST.map((day) => (
                      <div className="matrix-cell" role="cell" key={day}>
                        {slot.byDay[day].map(({ course, meeting }, index) => (
                          <div className={["course-line-wrap", pickedSet.has(course.id) ? "picked" : "", highlightEnglish && isEnglish(course) ? "english" : ""].filter(Boolean).join(" ")} key={`${course.id}-${index}`}>
                            <button
                              className="course-line"
                              type="button"
                              title={isEnglish(course) ? "영어강의" : undefined}
                              style={{ borderLeftColor: colorFor(course), background: `${colorFor(course)}12` }}
                              onClick={() => setSelectedCourse(course)}
                            >
                              <strong>{course.name}</strong><small>({course.professor || "미정"})</small>
                              <span className="course-line-time">~{formatMinutes(meeting.end)}</span>
                            </button>
                            <button
                              className="pick-button"
                              type="button"
                              aria-pressed={pickedSet.has(course.id)}
                              aria-label={`${course.name} ${pickedSet.has(course.id) ? "담기 취소" : "담기"}`}
                              onClick={() => togglePicked(course)}
                            >
                              {pickedSet.has(course.id) ? "✓" : "+"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : view === "list" ? (
            <div className="course-list">{filteredCourses.map((course) => <div key={course.id} className={["course-row", pickedSet.has(course.id) ? "picked" : "", highlightEnglish && isEnglish(course) ? "english" : ""].filter(Boolean).join(" ")}><button onClick={() => setSelectedCourse(course)}><span className="course-color" style={{ background: colorFor(course) }} /><span className="course-list-main"><strong>{course.name}{roleLabelFor(course) && <em className="core-badge" style={{ color: colorFor(course), background: `${colorFor(course)}14` }}>{roleLabelFor(course)}</em>}{highlightEnglish && isEnglish(course) && <em className="core-badge english">영어강의</em>}</strong><small>{course.code}-{course.section} · {course.department}</small></span><span className="course-list-time">{course.schedule || "시간 미정"}<small>{course.professor || "담당교수 미정"}</small></span><span aria-hidden="true">›</span></button><button className="pick-button" type="button" aria-pressed={pickedSet.has(course.id)} aria-label={`${course.name} ${pickedSet.has(course.id) ? "담기 취소" : "담기"}`} onClick={() => togglePicked(course)}>{pickedSet.has(course.id) ? "✓ 담김" : "+ 담기"}</button></div>)}</div>
          ) : view === "mine" ? (
            pickedCourses.length === 0 ? (
              <div className="empty-state"><span>▦</span><strong>담은 과목이 없어요</strong><p>교시별 후보나 목록에서 <b>+</b>를 눌러 담으면<br />여기에 시간표로 그려드려요.</p></div>
            ) : (
              <div className="calendar-wrap">
                <div className="calendar-summary">
                  <strong>{pickedCourses.length}과목 · {pickedCredits}학점</strong>
                  {myCalendar.conflictCount > 0
                    ? <em className="clash">시간이 겹치는 과목이 있어요</em>
                    : <em className="clear">시간 충돌 없음</em>}
                  <button type="button" onClick={() => setPickedIds([])}>전체 비우기</button>
                </div>
                <div className="calendar" style={{ ["--rows" as string]: myCalendar.rows }}>
                  <div className="calendar-corner" />
                  {DAY_LIST.map((day) => <div className="calendar-head" key={day}>{day}</div>)}
                  <div className="calendar-time">
                    {myCalendarMarks.map((mark) => (
                      <span key={mark.time} style={{ gridRow: mark.row }}>{formatMinutes(mark.time)}</span>
                    ))}
                  </div>
                  {DAY_LIST.map((day) => (
                    <div
                      className="calendar-day"
                      key={day}
                      style={{ ["--lanes" as string]: myCalendar.byDay[day].lanes }}
                    >
                      {myCalendar.byDay[day].blocks.map(({ entry, lane, conflict, rowStart, rowSpan }, index) => (
                        <button
                          className={["calendar-block", conflict ? "clash" : "", highlightEnglish && isEnglish(entry.course) ? "english" : ""].filter(Boolean).join(" ")}
                          type="button"
                          key={`${entry.course.id}-${index}`}
                          style={{
                            gridRow: `${rowStart} / span ${rowSpan}`,
                            gridColumn: lane + 1,
                            borderLeftColor: colorFor(entry.course),
                            background: `${colorFor(entry.course)}14`,
                          }}
                          title={isEnglish(entry.course) ? "영어강의" : undefined}
                          onClick={() => setSelectedCourse(entry.course)}
                        >
                          <strong>{entry.course.name}</strong>
                          <small>{formatMinutes(entry.meeting.start)}~{formatMinutes(entry.meeting.end)}</small>
                          <small>{entry.course.professor || "교수 미정"}</small>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                {pickedWithoutTime.length > 0 && (
                  <p className="calendar-untimed">시간 미정으로 표에 못 놓은 과목: {pickedWithoutTime.map((course) => course.name).join(", ")}</p>
                )}
              </div>
            )
          ) : null}
        </section>
      </div>

      {showResults && (
        <section className="helpful-card" aria-label="도움이 됐는지 알려주기">
          {helpfulVote === null ? (
            <>
              <p><strong>이 시간표가 도움이 됐나요?</strong><small>한 번만 여쭤보고 다시 묻지 않을게요.</small></p>
              <div className="helpful-actions">
                <button type="button" className="primary-button" onClick={() => voteHelpful("yes")}>도움이 됐어요</button>
                <button type="button" onClick={() => voteHelpful("no")}>아쉬웠어요</button>
              </div>
            </>
          ) : (
            <p role="status">
              <strong>{helpfulVote === "yes" ? "고맙습니다. 남은 수강신청도 잘 마치시길!" : "알려주셔서 고맙습니다."}</strong>
              <small>{helpfulVote === "yes" ? "더 필요한 게 생기면 오른쪽 아래 건의하기로 알려주세요." : "어떤 점이 아쉬웠는지 적어주시면 다음 학기에 반영할게요."}</small>
            </p>
          )}
        </section>
      )}

      <footer>
        <span>CourseCheck · 서강대 전공 시간표 도우미</span>
        <span className="build-stamp" title={buildStampTitle}>v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
        <span><Link href="/privacy">개인정보 처리방침</Link> · 학교 공식 서비스가 아닙니다.</span>
      </footer>

      <FeedbackLauncher open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {profileLoading && <div className="profile-backdrop"><div className="profile-loading" role="status"><span className="brand-mark">C</span><p>내 설정을 확인하고 있어요…</p></div></div>}
      {!profileLoading && profileOpen && <ProfileSetup initialProfile={profile} onClose={profile ? () => setProfileOpen(false) : undefined} onSaved={profileSaved} />}
      {selectedCourse && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedCourse(null)}><article className="course-modal" role="dialog" aria-modal="true" aria-labelledby="course-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedCourse(null)} aria-label="닫기">×</button><span className="modal-code">{selectedCourse.code}-{selectedCourse.section}</span><h3 id="course-title">{selectedCourse.name}</h3><dl><div><dt>시간</dt><dd>{selectedCourse.schedule || "미정"}</dd></div><div><dt>교수진</dt><dd>{selectedCourse.professor || "미정"}</dd></div><div><dt>학점</dt><dd>{selectedCourse.credits}학점</dd></div><div><dt>개설학과</dt><dd>{selectedCourse.department}</dd></div>{isEnglish(selectedCourse) && <div><dt>강의언어</dt><dd>영어강의</dd></div>}{preMajorOf(selectedCourse) && <div><dt>전공입문</dt><dd>{preMajorOf(selectedCourse)!.major} · {preMajorOf(selectedCourse)!.rule}<small> ({preMajorSource.bulletinYear}학년도 요람)</small></dd></div>}{trackLabelFor(selectedCourse) && <div><dt>필수 교양</dt><dd>{trackLabelFor(selectedCourse)} · {bulletinYear}학년도 요람</dd></div>}</dl>{selectedCourse.note && <p className="course-note">{selectedCourse.note}</p>}<div className="modal-actions"><button className="primary-button" type="button" onClick={() => togglePicked(selectedCourse)}>{pickedSet.has(selectedCourse.id) ? "내 시간표에서 빼기" : "내 시간표에 담기"}</button><a href={officialSources.courses} target="_blank" rel="noreferrer">공식 개설교과목정보에서 확인 ↗</a></div></article></div>}
    </main>
  );
}
