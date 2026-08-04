"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import coursesJson from "./data/courses.generated.json";
import { linkedMajors, officialSources } from "./data/majors";
import { departmentOptions } from "./data/major-options";
import ProfileSetup, { type UserProfile } from "./components/ProfileSetup";
import { extractEverytimeUrl } from "./lib/everytime-link.mjs";
import { groupTimetableEntries } from "./lib/timetable-layout.mjs";

type Course = (typeof coursesJson)[number];
type ImportedCourse = { name: string; professor: string; room: string };
type ImportedTerm = { semester: string; courses: ImportedCourse[]; available?: boolean };
type Meeting = { day: string; start: number; end: number };

const DAY_LIST = ["월", "화", "수", "목", "금"] as const;
const PALETTE = ["#8b1e3f", "#1f6b5c", "#345995", "#c26532", "#6d4c8e"];

function normalizeCourseName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\([^)]*(캡스톤|영어|온라인|재수강)[^)]*\)/gi, "")
    .replace(/[\s·&_-]+/g, "")
    .toLowerCase();
}

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

function hashColor(value: string) {
  const hash = [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}

function postEvent(event: string, majorKey?: string, resultBucket?: string) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, majorKey, resultBucket }),
    keepalive: true,
  }).catch(() => undefined);
}

function profileSelections(savedProfile: UserProfile) {
  const majors = [savedProfile.major1, savedProfile.major2, savedProfile.major3].filter(Boolean) as string[];
  return {
    linked: linkedMajors.filter((major) => majors.includes(major.label)).map((major) => major.key),
    departments: majors.filter((major) => departmentOptions.includes(major)),
  };
}

export default function Home() {
  const [selectedLinked, setSelectedLinked] = useState<string[]>(["BDS"]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"timetable" | "list">("timetable");
  const [everytimeUrl, setEverytimeUrl] = useState("");
  const [importedTerms, setImportedTerms] = useState<ImportedTerm[]>([]);
  const [activeImportedTerm, setActiveImportedTerm] = useState("");
  const [includedTakenNames, setIncludedTakenNames] = useState<string[]>([]);
  const [manualExcludeInput, setManualExcludeInput] = useState("");
  const [manualExcludedCourses, setManualExcludedCourses] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [importMessage, setImportMessage] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const viewed = useRef(false);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      postEvent("page_view");
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      fetch("/api/profile", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/stats").then((response) => response.ok ? response.json() : null),
    ]).then(([profileData, statsData]) => {
      const savedProfile = profileData.profile as UserProfile | null;
      setProfile(savedProfile);
      setProfileOpen(!savedProfile);
      if (savedProfile) {
        const selections = profileSelections(savedProfile);
        setSelectedLinked(selections.linked);
        setSelectedDepartments(selections.departments);
      }
      if (typeof statsData?.users?.total === "number") setUserCount(statsData.users.total);
    }).catch(() => setProfileOpen(true)).finally(() => setProfileLoading(false));
  }, []);

  function profileSaved(savedProfile: UserProfile) {
    const isNew = !profile;
    setProfile(savedProfile);
    const selections = profileSelections(savedProfile);
    setSelectedLinked(selections.linked);
    setSelectedDepartments(selections.departments);
    setProfileOpen(false);
    setShowResults(false);
    if (isNew) setUserCount((current) => current === null ? null : current + 1);
    postEvent("profile_saved");
  }

  const profileMajors = useMemo(
    () => profile ? [profile.major1, profile.major2, profile.major3].filter(Boolean) as string[] : [],
    [profile],
  );
  const activeTerm = importedTerms.find((term) => term.semester === activeImportedTerm) ?? importedTerms[0];
  const includedTakenSet = useMemo(() => new Set(includedTakenNames), [includedTakenNames]);
  const allImportedCourses = useMemo(() => importedTerms.flatMap((term) => term.courses), [importedTerms]);
  const excludedNames = useMemo(() => {
    const names = new Set(
      allImportedCourses
        .map((course) => normalizeCourseName(course.name))
        .filter((name) => !includedTakenSet.has(name)),
    );
    manualExcludedCourses.forEach((name) => names.add(normalizeCourseName(name)));
    return names;
  }, [allImportedCourses, includedTakenSet, manualExcludedCourses]);
  const courseNameOptions = useMemo(
    () => [...new Set(coursesJson.map((course) => course.name))].sort((a, b) => a.localeCompare(b, "ko")),
    [],
  );

  const filteredCourses = useMemo(() => {
    const selectedCodeSets = linkedMajors
      .filter((major) => selectedLinked.includes(major.key))
      .map((major) => new Set(major.codes));
    const normalizedQuery = query.trim().toLowerCase();

    return coursesJson.filter((course) => {
      const majorMatch = selectedCodeSets.some((codes) => codes.has(course.code)) || selectedDepartments.includes(course.department);
      const searchMatch = !normalizedQuery || `${course.name} ${course.code} ${course.professor}`.toLowerCase().includes(normalizedQuery);
      return majorMatch && searchMatch && !excludedNames.has(normalizeCourseName(course.name));
    });
  }, [selectedLinked, selectedDepartments, query, excludedNames]);

  const timetableSlots = useMemo(() => groupTimetableEntries(
    filteredCourses.flatMap((course) => parseMeetings(course.schedule).map((meeting) => ({ course, meeting }))),
    DAY_LIST,
  ) as Array<{
    start: number;
    end: number;
    byDay: Record<string, Array<{ course: Course; meeting: Meeting }>>;
  }>, [filteredCourses]);
  const hiddenTakenCount = useMemo(
    () => coursesJson.filter((course) => excludedNames.has(normalizeCourseName(course.name))).length,
    [excludedNames],
  );

  function colorFor(course: Course) {
    const linked = linkedMajors.find((major) => selectedLinked.includes(major.key) && major.codes.includes(course.code));
    return linked?.color ?? hashColor(course.department);
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
      postEvent("everytime_import", undefined, importedCourseCount === 0 ? "0" : importedCourseCount <= 5 ? "1-5" : "6+");
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

  function revealResults() {
    setShowResults(true);
    postEvent("results_view", undefined, filteredCourses.length === 0 ? "0" : filteredCourses.length <= 25 ? "1-25" : "26+");
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CourseCheck 처음으로"><span className="brand-mark">C</span><span><strong>CourseCheck</strong><small>SOGANG</small></span></a>
        <div className="header-actions">
          {profile && <button className="profile-edit" type="button" onClick={() => setProfileOpen(true)}>{String(profile.cohortYear).slice(2)}학번 · {profile.completedSemesters}학기 <span>수정</span></button>}
          <div className="header-meta"><span className="live-dot" />2026-2 개설과목 · 7월 27일 기준</div>
        </div>
      </header>

      <section className="hero" id="top">
        <div><p className="eyebrow">전공은 복잡해도, 시간표는 한눈에</p><h1>내 전공으로 이번 학기<br />시간표를 다시 그리세요.</h1><p className="hero-copy">학과 코드만으로 찾기 어려운 연계전공 과목까지 요람 기준으로 모았습니다. 들었던 과목은 에브리타임 링크로 한 번에 제외할 수 있어요.</p></div>
        <div className="trust-card"><span className="shield" aria-hidden="true">✓</span><div><strong>시간표 링크는 저장하지 않아요</strong><p>과목명만 비교하고 원문과 링크 토큰은 즉시 버립니다.</p></div></div>
      </section>

      <div className="workspace">
        <aside className="control-panel" aria-label="시간표 설정">
          <section className="control-section">
            <div className="section-heading"><span className="step">1</span><div><strong>전공 선택 확인</strong><small>처음 입력한 내 전공이에요</small></div></div>
            <div className="profile-summary">
              <div><span>{profile ? `${String(profile.cohortYear).slice(2)}학번` : "학번"}</span><span>{profile ? `${profile.completedSemesters}학기 이수` : "이수학기"}</span></div>
              <ul>{profileMajors.map((major, index) => <li key={`${major}-${index}`}><small>{index + 1}전공</small><strong>{major}</strong></li>)}</ul>
              <button type="button" onClick={() => setProfileOpen(true)}>전공 정보 수정</button>
            </div>
          </section>

          <section className="control-section exclusion-section">
            <div className="section-heading"><span className="step">2</span><div><strong>들은 과목 제외하기</strong><small>선택 사항 · 과목별로 바꿀 수 있어요</small></div></div>
            <p className="semester-help">공유 링크 하나로 공개된 이전 학기 시간표까지 모두 가져와 학기별 탭에 모아드려요.</p>
            <form onSubmit={importEverytime} className="import-form">
              <label htmlFor="everytime-url">에브리타임 공유 링크 또는 복사한 문구</label>
              <input id="everytime-url" inputMode="url" autoComplete="off" placeholder="공유 문구 전체를 그대로 붙여넣으세요" value={everytimeUrl} onChange={(event) => setEverytimeUrl(extractEverytimeUrl(event.target.value))} required />
              <button className="primary-button" disabled={importState === "loading"}>{importState === "loading" ? "전체 학기 확인하는 중…" : importedTerms.length ? "수강 내역 다시 가져오기" : "전체 수강 내역 가져오기"}</button>
            </form>
            {importMessage && <p className={`import-message ${importState}`} role="status">{importMessage}</p>}

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

            <p className="privacy-note"><span>잠금</span> 이름·전체 학번·링크·IP는 저장하지 않습니다.</p>
            <button className="show-results-button" type="button" onClick={revealResults}>개설 시간표 확인하기 <span>→</span></button>
          </section>

          <section className="source-card"><strong>데이터 출처</strong><a href={officialSources.bulletin} target="_blank" rel="noreferrer">서강대학교 대학요람 <span>↗</span></a><a href={officialSources.courses} target="_blank" rel="noreferrer">개설교과목정보 <span>↗</span></a></section>
        </aside>

        <section className="result-panel" aria-label="개설 과목 시간표" ref={resultsRef}>
          <div className="result-toolbar">
            <div><p className="semester-label">3 · 2026학년도 2학기</p><h2>내 조건에 맞는 개설 시간표 {showResults && <span>{filteredCourses.length}과목</span>}</h2>{showResults && hiddenTakenCount > 0 && <small>{hiddenTakenCount}개 수강·추가 과목 제외됨</small>}</div>
            {showResults && <div className="toolbar-actions"><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="과목 검색" placeholder="과목명·교수·코드 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="view-toggle" aria-label="보기 방식"><button type="button" className={view === "timetable" ? "active" : ""} onClick={() => setView("timetable")} aria-label="시간표 보기">▦</button><button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="목록 보기">☷</button></div></div>}
          </div>

          {!showResults ? (
            <div className="result-placeholder"><span>3</span><strong>조건을 확인하면 시간표가 열려요</strong><p>전공과 제외할 과목을 확인한 뒤<br />‘개설 시간표 확인하기’를 눌러주세요.</p></div>
          ) : filteredCourses.length === 0 ? (
            <div className="empty-state"><span>⌕</span><strong>조건에 맞는 과목이 없어요</strong><p>전공 정보를 수정하거나 제외 과목을 줄여보세요.</p></div>
          ) : view === "timetable" ? (
            <div className="timetable-scroll">
              <div className="timetable-matrix" role="table" aria-label="요일별 개설 시간표">
                <div className="matrix-head matrix-time-head" role="columnheader">시간</div>
                {DAY_LIST.map((day) => <div className="matrix-head" role="columnheader" key={day}>{day}요일</div>)}
                {timetableSlots.map((slot) => (
                  <div className="matrix-row" role="row" key={`${slot.start}-${slot.end}`}>
                    <div className="matrix-time" role="rowheader"><strong>{formatMinutes(slot.start)}</strong><span>{formatMinutes(slot.end)}</span></div>
                    {DAY_LIST.map((day) => (
                      <div className="matrix-cell" role="cell" key={day}>
                        {slot.byDay[day].map(({ course }, index) => (
                          <button
                            className="course-line"
                            type="button"
                            key={`${course.id}-${index}`}
                            style={{ borderLeftColor: colorFor(course), background: `${colorFor(course)}12` }}
                            onClick={() => setSelectedCourse(course)}
                          >
                            <strong>{course.name}</strong><small>({course.professor || "미정"})</small>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="course-list">{filteredCourses.map((course) => <button key={course.id} onClick={() => setSelectedCourse(course)}><span className="course-color" style={{ background: colorFor(course) }} /><span className="course-list-main"><strong>{course.name}</strong><small>{course.code}-{course.section} · {course.department}</small></span><span className="course-list-time">{course.schedule || "시간 미정"}<small>{course.professor || "담당교수 미정"}</small></span><span aria-hidden="true">›</span></button>)}</div>
          )}
        </section>
      </div>

      <section className="security-strip"><div><span>01</span><strong>최소 수집</strong><p>입학 연도·이수학기·전공과 익명 브라우저 ID만 저장합니다.</p></div><div><span>02</span><strong>외부 요청 제한</strong><p>에브리타임 공식 도메인과 올바른 공유 토큰만 허용합니다.</p></div><div><span>03</span><strong>원문 즉시 폐기</strong><p>시간표 HTML과 공유 링크는 응답 후 저장하지 않습니다.</p></div></section>
      <footer><span>CourseCheck · 서강대 전공 시간표 도우미</span><span>{userCount === null ? "브라우저 기준 익명 사용자 집계" : `${userCount.toLocaleString("ko-KR")}명이 설정을 완료했어요`} · 학교 공식 서비스가 아닙니다.</span></footer>

      {profileLoading && <div className="profile-backdrop"><div className="profile-loading" role="status"><span className="brand-mark">C</span><p>내 설정을 확인하고 있어요…</p></div></div>}
      {!profileLoading && profileOpen && <ProfileSetup initialProfile={profile} onClose={profile ? () => setProfileOpen(false) : undefined} onSaved={profileSaved} />}
      {selectedCourse && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedCourse(null)}><article className="course-modal" role="dialog" aria-modal="true" aria-labelledby="course-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedCourse(null)} aria-label="닫기">×</button><span className="modal-code">{selectedCourse.code}-{selectedCourse.section}</span><h3 id="course-title">{selectedCourse.name}</h3><dl><div><dt>시간</dt><dd>{selectedCourse.schedule || "미정"}</dd></div><div><dt>교수진</dt><dd>{selectedCourse.professor || "미정"}</dd></div><div><dt>학점</dt><dd>{selectedCourse.credits}학점</dd></div><div><dt>개설학과</dt><dd>{selectedCourse.department}</dd></div></dl>{selectedCourse.note && <p className="course-note">{selectedCourse.note}</p>}<a href={officialSources.courses} target="_blank" rel="noreferrer">공식 개설교과목정보에서 확인 ↗</a></article></div>}
    </main>
  );
}
