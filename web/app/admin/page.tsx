"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { colleges } from "../data/core-curriculum.mjs";
import { feedbackCategories } from "../lib/feedback.mjs";

type Message = {
  id: number;
  category: string;
  message: string;
  status: string;
  createdAt: string;
  cohortYear: number | null;
  college: string | null;
};

type Dataset = { id: number; semester: string; courseCount: number; uploadedAt: string };

type Overview = {
  users: { total: number; last24h: number; visiting: number; consented: number; excluded: number };
  events: Array<{ event: string; total: number; last24h: number }>;
  profiles: {
    byCollege: Array<{ college: string | null; total: number }>;
    byCohort: Array<{ cohortYear: number; total: number }>;
    bySemesters: Array<{ semesters: number; total: number }>;
    byMajor: Array<{ major: string; first: number; second: number; third: number; total: number }>;
  };
  eventsBy: Record<Unit, Array<{ key: string | null; event: string; total: number }>>;
  flow: {
    reach: Array<{ event: string; people: number }>;
    journeys: Array<{ steps: string[]; people: number }>;
  };
  feedback: Array<{ status: string; total: number }>;
  helpful: Array<{ vote: string; total: number }>;
  everytimeFailures: {
    byReason: Array<{ scope: string; reasonCode: string; total: number }>;
    byStep: Array<{ step: string | null; total: number }>;
    last24h: number;
    ready: boolean;
  };
};

/** 최근 기록 한 줄. 목록은 집계와 따로 /api/admin/events가 쪽 단위로 답합니다. */
type LogEntry = {
  id: number;
  event: string;
  college: string | null;
  major: string | null;
  cohortYear: number | null;
  completedSemesters: number | null;
  resultBucket: string | null;
  createdAt: string;
};

/** 이벤트를 어떤 단위로 묶어 볼지 */
type Unit = "college" | "major" | "cohort" | "semesters";
const UNITS: Array<{ key: Unit; label: string; empty: string }> = [
  { key: "college", label: "소속 대학", empty: "소속 미선택" },
  { key: "major", label: "1전공", empty: "전공 미상" },
  { key: "cohort", label: "학번", empty: "학번 미상" },
  { key: "semesters", label: "이수학기", empty: "학기 미상" },
];

/** 이벤트 이름을 사람이 읽을 말로 */
const EVENT_LABEL = new Map<string, string>([
  ["page_view", "첫 화면 열기"],
  ["profile_saved", "전공 설정 저장"],
  ["results_view", "개설 시간표 확인"],
  ["everytime_import", "에브리타임 가져오기"],
  ["everytime_import_error", "에브리타임 실패"],
  ["course_pick", "과목 담기"],
  ["ge_mode", "교양 표시 전환"],
  ["english_highlight", "영어강의 강조 전환"],
  ["feedback_open", "건의 창 열기"],
  ["helpful_vote", "도움이 됐나요 응답"],
]);

/** 묶음 값은 이벤트마다 뜻이 달라서 그대로 두면 읽기 어렵다 */
const BUCKET_LABEL = new Map<string, string>([
  ["yes", "도움 됐어요"],
  ["no", "아쉬웠어요"],
  ["all", "교양 전체"],
  ["core", "필수 교양만"],
  ["none", "전공만"],
  ["on", "켬"],
  ["off", "끔"],
]);

/** 에브리타임 실패 사유 코드를 사람이 읽을 말로 (route.ts의 EverytimeFailure 코드와 짝) */
const FAILURE_LABEL = new Map<string, string>([
  ["not_everytime_link", "에브리타임 링크가 아님"],
  ["bad_link", "링크 형식이 다름"],
  ["not_public", "시간표가 안 열림"],
  ["blocked", "에브리타임이 자동 확인 제한"],
  ["too_big", "응답이 너무 큼"],
  ["bad_identifier", "학기 식별자 이상"],
  ["timeout", "15초 안에 응답 없음"],
  ["unknown", "예상 못 한 오류"],
]);

/** 요청이 어디까지 갔다가 멈췄는지 */
const FAILURE_STEP_LABEL = new Map<string, string>([
  ["link", "링크 읽기"],
  ["bootstrap", "공유 페이지 열기"],
  ["first_table", "첫 시간표 받기"],
  ["terms", "학기별 시간표 받기"],
]);

/** 사람들이 대개 밟는 순서. 흐름을 이 차례로 세웁니다. */
const FLOW_STEPS = ["page_view", "profile_saved", "results_view", "course_pick", "helpful_vote"];

const CATEGORY_LABEL = new Map<string, string>(feedbackCategories.map((item) => [item.key, item.label]));
const COLLEGE_LABEL = new Map<string, string>(colleges.map((item) => [item.key, item.label]));
const STATUS_FLOW = [
  { key: "new", label: "새 건의" },
  { key: "reading", label: "확인 중" },
  { key: "done", label: "처리 완료" },
];

export default function AdminPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<"feedback" | "stats" | "courses">("feedback");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [unit, setUnit] = useState<Unit>("college");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState("");
  /** 최근 기록은 한 쪽씩 이어 받습니다 — 30일치를 한 번에 내려보내면 응답이 너무 커집니다. */
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logHasMore, setLogHasMore] = useState(false);
  const [logBusy, setLogBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    const [feedbackResponse, overviewResponse, coursesResponse, logResponse] = await Promise.all([
      fetch("/api/admin/feedback", { cache: "no-store" }),
      fetch("/api/admin/overview", { cache: "no-store" }),
      fetch("/api/admin/courses", { cache: "no-store" }),
      fetch("/api/admin/events", { cache: "no-store" }),
    ]);
    if (feedbackResponse.status === 401 || overviewResponse.status === 401) {
      return {
        signedIn: false,
        messages: [] as Message[],
        overview: null,
        datasets: [] as Dataset[],
        log: [] as LogEntry[],
        logTotal: 0,
        logHasMore: false,
      };
    }
    const feedbackData = (await feedbackResponse.json()) as { messages?: Message[]; error?: string };
    if (!feedbackResponse.ok) throw new Error(feedbackData.error || "불러오지 못했어요.");
    const overviewData = overviewResponse.ok ? ((await overviewResponse.json()) as Overview) : null;
    const coursesData = coursesResponse.ok ? ((await coursesResponse.json()) as { datasets?: Dataset[] }) : null;
    const logData = logResponse.ok
      ? ((await logResponse.json()) as { events?: LogEntry[]; hasMore?: boolean; total?: number })
      : null;
    return {
      signedIn: true,
      messages: feedbackData.messages ?? [],
      overview: overviewData,
      datasets: coursesData?.datasets ?? [],
      log: logData?.events ?? [],
      logTotal: logData?.total ?? 0,
      logHasMore: logData?.hasMore ?? false,
    };
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await fetchAll();
      setSignedIn(result.signedIn);
      setMessages(result.messages);
      setOverview(result.overview);
      setDatasets(result.datasets);
      setLog(result.log);
      setLogTotal(result.logTotal);
      setLogHasMore(result.logHasMore);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchAll();
        if (cancelled) return;
        setSignedIn(result.signedIn);
        setMessages(result.messages);
        setOverview(result.overview);
        setDatasets(result.datasets);
        setLog(result.log);
        setLogTotal(result.logTotal);
        setLogHasMore(result.logHasMore);
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchAll]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "로그인하지 못했어요.");
      setToken("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인하지 못했어요.");
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    setSignedIn(false);
    setMessages([]);
    setOverview(null);
    setDatasets([]);
  }

  async function uploadCourses(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    if (!input?.files?.[0]) {
      setUploadState("error");
      setUploadMessage("파일을 선택해 주세요.");
      return;
    }
    setUploadState("uploading");
    setUploadMessage("");
    try {
      const body = new FormData();
      body.append("file", input.files[0]);
      const response = await fetch("/api/admin/courses", { method: "POST", body });
      const data = (await response.json()) as { ok?: boolean; semester?: string; courseCount?: number; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "올리지 못했어요.");
      setUploadState("done");
      setUploadMessage(`${data.semester} 개설과목 ${data.courseCount?.toLocaleString("ko-KR")}과목을 반영했어요.`);
      form.reset();
      await load();
    } catch (caught) {
      setUploadState("error");
      setUploadMessage(caught instanceof Error ? caught.message : "올리지 못했어요.");
    }
  }

  async function purgeEvents(scope: "old" | "all") {
    const question = scope === "all"
      ? "기록된 익명 이벤트를 전부 지웁니다. 되돌릴 수 없어요. 계속할까요?"
      : "30일이 지난 이벤트를 지웁니다. 계속할까요?";
    if (!window.confirm(question)) return;
    setBusy(true);
    setPurgeMessage("");
    try {
      const response = await fetch(`/api/admin/overview?scope=${scope}`, { method: "DELETE" });
      const data = (await response.json()) as { removed?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "지우지 못했어요.");
      setPurgeMessage(`${(data.removed ?? 0).toLocaleString("ko-KR")}건을 지웠어요.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "지우지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: number, status: string) {
    setMessages((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
    const response = await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) {
      setError("상태를 바꾸지 못했어요.");
      void load();
    }
  }

  /**
   * 다음 쪽을 이어 받습니다. 마지막으로 받은 줄의 id를 기준으로 물어 같은 줄이 겹치지 않게 합니다.
   */
  async function loadMoreLog() {
    const last = log[log.length - 1];
    if (!last || logBusy) return;
    setLogBusy(true);
    try {
      const response = await fetch(`/api/admin/events?before=${last.id}`, { cache: "no-store" });
      const data = (await response.json()) as { events?: LogEntry[]; hasMore?: boolean; total?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "기록을 더 불러오지 못했어요.");
      setLog((current) => [...current, ...(data.events ?? [])]);
      setLogHasMore(data.hasMore ?? false);
      setLogTotal(data.total ?? logTotal);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "기록을 더 불러오지 못했어요.");
    } finally {
      setLogBusy(false);
    }
  }

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of messages) map.set(item.status, (map.get(item.status) ?? 0) + 1);
    return map;
  }, [messages]);
  const shown = filter === "all" ? messages : messages.filter((item) => item.status === filter);

  /**
   * 고른 단위(행) × 이벤트(열) 표.
   * 설정을 저장하기 전에 찍힌 첫 화면 열기는 붙일 값이 없어 "미선택"으로 모입니다.
   */
  const matrix = useMemo(() => {
    const empty = { columns: [] as string[], rows: [] as Array<{ key: string | null; total: number; byEvent: Map<string, number> }> };
    if (!overview) return empty;
    const columns = overview.events.map((row) => row.event);
    const rows = new Map<string, { key: string | null; total: number; byEvent: Map<string, number> }>();
    for (const row of overview.eventsBy[unit] ?? []) {
      const id = row.key ?? "";
      const entry = rows.get(id) ?? { key: row.key, total: 0, byEvent: new Map<string, number>() };
      entry.total += row.total;
      entry.byEvent.set(row.event, (entry.byEvent.get(row.event) ?? 0) + row.total);
      rows.set(id, entry);
    }
    return { columns, rows: [...rows.values()].sort((a, b) => b.total - a.total) };
  }, [overview, unit]);

  /**
   * 「도움이 됐나요」 응답. 답한 사람 중 몇 %가 도움이 됐다고 했는지가 보고 싶은 숫자라
   * 답 없는 옛 기록(unknown)은 비율에서 뺍니다.
   */
  const helpful = useMemo(() => {
    const votes = new Map((overview?.helpful ?? []).map((row) => [row.vote, row.total]));
    const yes = votes.get("yes") ?? 0;
    const no = votes.get("no") ?? 0;
    const answered = yes + no;
    return { yes, no, answered, rate: answered > 0 ? Math.round((yes / answered) * 100) : null };
  }, [overview]);

  /** 알려진 차례대로 세우고, 그 밖의 이벤트는 사람 수 순으로 뒤에 붙인다 */
  const reach = useMemo(() => {
    if (!overview) return [] as Array<{ event: string; people: number; share: number; dropped: number }>;
    const people = new Map(overview.flow.reach.map((row) => [row.event, row.people]));
    const ordered = [
      ...FLOW_STEPS.filter((event) => people.has(event)),
      ...overview.flow.reach
        .filter((row) => !FLOW_STEPS.includes(row.event))
        .sort((a, b) => b.people - a.people)
        .map((row) => row.event),
    ];
    const top = Math.max(...people.values(), 1);
    return ordered.map((event, index) => {
      const count = people.get(event) ?? 0;
      const previous = index > 0 ? people.get(ordered[index - 1]) ?? 0 : count;
      return { event, people: count, share: Math.round((count / top) * 100), dropped: Math.max(previous - count, 0) };
    });
  }, [overview]);

  function unitLabel(key: string | null) {
    if (key === null) return UNITS.find((item) => item.key === unit)!.empty;
    if (unit === "college") return COLLEGE_LABEL.get(key) ?? key;
    if (unit === "cohort") return `${key.slice(2)}학번`;
    if (unit === "semesters") return `${key}학기`;
    return key;
  }

  if (!signedIn) {
    return (
      <main className="admin-gate">
        <form onSubmit={signIn}>
          <span className="brand-mark">C</span>
          <h1>건의 관리</h1>
          <p>관리자 키를 입력하세요. 키는 저장하지 않고 서명한 세션 쿠키만 남깁니다.</p>
          <input
            type="password"
            aria-label="관리자 키"
            autoComplete="current-password"
            placeholder="ADMIN_TOKEN"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
          {error && <p className="feedback-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy || !token}>{busy ? "확인 중…" : "들어가기"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header>
        <div>
          <h1>건의 관리</h1>
          <p>{messages.length}건 · 새 건의 {counts.get("new") ?? 0}건</p>
        </div>
        <div className="admin-tools">
          <button type="button" onClick={() => void load()} disabled={busy}>{busy ? "새로고침 중…" : "새로고침"}</button>
          <button type="button" className="ghost" onClick={() => void signOut()}>로그아웃</button>
        </div>
      </header>

      <div className="admin-tabs" role="tablist" aria-label="화면 전환">
        <button type="button" role="tab" aria-selected={tab === "feedback"} className={tab === "feedback" ? "active" : ""} onClick={() => setTab("feedback")}>
          건의<span>{messages.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "stats"} className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>
          집계·로그{logTotal > 0 && <span>{logTotal.toLocaleString("ko-KR")}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "courses"} className={tab === "courses" ? "active" : ""} onClick={() => setTab("courses")}>
          개설과목{datasets.length > 0 && <span>{datasets.length}</span>}
        </button>
      </div>

      {error && <p className="feedback-error" role="alert">{error}</p>}

      {tab === "courses" ? (
        <>
          <form className="upload-form" onSubmit={uploadCourses}>
            <label htmlFor="course-file">SIS 개설교과목정보 파일</label>
            <p className="upload-hint">
              <a href="https://sis109.sogang.ac.kr/sap/bc/webdynpro/sap/zcmw9016?sap-language=KO" target="_blank" rel="noreferrer">개설교과목정보 ↗</a>
              에서 학년도·학기를 골라 조회한 뒤 엑셀로 내려받아 그대로 올리세요.
              확장자는 <code>.xls</code>지만 실제로는 HTML 표라서 변환 없이 읽습니다.
            </p>
            <div className="upload-row">
              <input id="course-file" name="file" type="file" accept=".xls,.xlsx,.html,text/html" required />
              <button className="primary-button" disabled={uploadState === "uploading"}>
                {uploadState === "uploading" ? "읽는 중…" : "올리기"}
              </button>
            </div>
            {uploadMessage && <p className={`import-message ${uploadState}`} role="status">{uploadMessage}</p>}
          </form>

          <h2 className="admin-subhead">올린 자료<small>가장 최근 것을 화면에 씁니다</small></h2>
          {datasets.length === 0 ? (
            <p className="admin-empty">아직 올린 자료가 없어요. 빌드에 포함된 기본 자료를 쓰고 있습니다.</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>학기</th><th>과목 수</th><th>올린 시각</th></tr></thead>
              <tbody>
                {datasets.map((row, index) => (
                  <tr key={row.id}>
                    <td><strong>{row.semester}</strong>{index === 0 && <small>사용 중</small>}</td>
                    <td className="num">{row.courseCount.toLocaleString("ko-KR")}</td>
                    <td className="num">{new Date(row.uploadedAt).toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : tab === "stats" ? (
        !overview ? (
          <p className="admin-empty">집계를 불러오지 못했어요.</p>
        ) : (
          <>
            <div className="stat-cards">
              <div className="stat-card">
                <small>설정 완료 사용자</small>
                <strong>{(overview.users.total - overview.users.visiting).toLocaleString("ko-KR")}</strong>
                <em>재학생 · 24시간 +{overview.users.last24h}</em>
              </div>
              <div className="stat-card"><small>둘러보기</small><strong>{overview.users.visiting.toLocaleString("ko-KR")}</strong><em>졸업·외부</em></div>
              {overview.users.excluded > 0 && (
                <div className="stat-card" title="관리자로 로그인한 채 저장한 설정. 왼쪽 숫자와 아래 분포에는 들어 있지 않습니다.">
                  <small>집계 제외</small>
                  <strong>{overview.users.excluded.toLocaleString("ko-KR")}</strong>
                  <em>내 브라우저</em>
                </div>
              )}
              <div className="stat-card">
                <small>이용 기록 동의</small>
                <strong>{overview.users.consented.toLocaleString("ko-KR")}</strong>
                <em>{overview.users.total > 0 ? `${Math.round((overview.users.consented / overview.users.total) * 100)}%` : "–"}</em>
              </div>
              <div className="stat-card">
                <small>도움이 됐나요</small>
                <strong>{helpful.rate === null ? "–" : `${helpful.rate}%`}</strong>
                <em>{helpful.answered > 0 ? `${helpful.answered.toLocaleString("ko-KR")}명 답함` : "아직 응답 없음"}</em>
              </div>
              <div className="stat-card">
                <small>에브리타임 실패</small>
                <strong>{overview.everytimeFailures.byReason.reduce((sum, row) => sum + row.total, 0).toLocaleString("ko-KR")}</strong>
                <em>{overview.everytimeFailures.ready ? `24시간 +${overview.everytimeFailures.last24h}` : "표 없음 · db:migrate 필요"}</em>
              </div>
              <div className="stat-card"><small>지금 떠 있는 배포</small><strong>{process.env.NEXT_PUBLIC_BUILD_REV}</strong><em>v{process.env.NEXT_PUBLIC_APP_VERSION}</em></div>
              {overview.feedback.map((row) => (
                <div className="stat-card" key={row.status}>
                  <small>{STATUS_FLOW.find((s) => s.key === row.status)?.label ?? row.status}</small>
                  <strong>{row.total}</strong><em>건의</em>
                </div>
              ))}
            </div>

            <h2 className="admin-subhead">이벤트 집계</h2>
            {overview.events.length === 0 ? (
              <p className="admin-empty">아직 기록된 이벤트가 없어요.</p>
            ) : (
              <table className="admin-table">
                <thead><tr><th>이벤트</th><th>전체</th><th>최근 24시간</th></tr></thead>
                <tbody>
                  {overview.events.map((row) => (
                    <tr key={row.event}>
                      <td><strong>{EVENT_LABEL.get(row.event) ?? row.event}</strong><small>{row.event}</small></td>
                      <td className="num">{row.total.toLocaleString("ko-KR")}</td>
                      <td className="num">{row.last24h > 0 ? row.last24h.toLocaleString("ko-KR") : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 className="admin-subhead">
              도움이 됐나요 응답
              <small>결과를 보고 답한 사람만 — 이벤트 합계로는 안 갈라지는 만족도</small>
            </h2>
            {helpful.answered === 0 ? (
              <p className="admin-empty">아직 응답이 없어요.</p>
            ) : (
              <table className="admin-table">
                <thead><tr><th>응답</th><th>수</th><th>비율</th></tr></thead>
                <tbody>
                  <tr>
                    <td><strong>{BUCKET_LABEL.get("yes")}</strong><small>yes</small></td>
                    <td className="num">{helpful.yes.toLocaleString("ko-KR")}</td>
                    <td className="num">{Math.round((helpful.yes / helpful.answered) * 100)}%</td>
                  </tr>
                  <tr>
                    <td><strong>{BUCKET_LABEL.get("no")}</strong><small>no</small></td>
                    <td className="num">{helpful.no.toLocaleString("ko-KR")}</td>
                    <td className="num">{Math.round((helpful.no / helpful.answered) * 100)}%</td>
                  </tr>
                </tbody>
              </table>
            )}

            <h2 className="admin-subhead">
              에브리타임 실패
              <small>화면에는 다듬은 문장만 나가서 사라지는 사유 — 배포에서도 사유 코드로 셉니다</small>
            </h2>
            {!overview.everytimeFailures.ready ? (
              <p className="admin-empty">everytime_failures 표가 아직 없어요. <code>npm run db:migrate</code>를 돌리면 쌓입니다.</p>
            ) : overview.everytimeFailures.byReason.length === 0 ? (
              <p className="admin-empty">아직 기록된 실패가 없어요.</p>
            ) : (
              <div className="admin-split">
                <table className="admin-table">
                  <thead><tr><th>사유</th><th>어디</th><th>수</th></tr></thead>
                  <tbody>
                    {overview.everytimeFailures.byReason.map((row) => (
                      <tr key={`${row.scope}-${row.reasonCode}`}>
                        <td>
                          <strong>{FAILURE_LABEL.get(row.reasonCode) ?? row.reasonCode}</strong>
                          <small>{row.reasonCode}</small>
                        </td>
                        <td>{row.scope === "semester" ? "학기 하나" : "요청 전체"}</td>
                        <td className="num">{row.total.toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="admin-table">
                  <thead><tr><th>멈춘 단계</th><th>수</th></tr></thead>
                  <tbody>
                    {overview.everytimeFailures.byStep.map((row) => (
                      <tr key={row.step ?? "none"}>
                        <td><strong>{row.step ? FAILURE_STEP_LABEL.get(row.step) ?? row.step : "단계 미상"}</strong></td>
                        <td className="num">{row.total.toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="admin-subhead">
              누가 쓰고 있나
              <small>소속·학번·이수학기 분포 — 설정을 저장한 모든 사람 (동의 여부와 무관한 집계)</small>
            </h2>
            <div className="admin-split">
              <table className="admin-table">
                <thead><tr><th>소속 대학</th><th>사람</th></tr></thead>
                <tbody>
                  {overview.profiles.byCollege.map((row) => (
                    <tr key={row.college ?? "none"}>
                      <td><strong>{row.college ? COLLEGE_LABEL.get(row.college) ?? row.college : "선택하지 않음"}</strong></td>
                      <td className="num">{row.total.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="admin-table">
                <thead><tr><th>학번</th><th>사람</th></tr></thead>
                <tbody>
                  {overview.profiles.byCohort.map((row) => (
                    <tr key={row.cohortYear}>
                      <td><strong>{String(row.cohortYear).slice(2)}학번</strong></td>
                      <td className="num">{row.total.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="admin-table">
                <thead><tr><th>이수학기</th><th>사람</th></tr></thead>
                <tbody>
                  {overview.profiles.bySemesters.map((row) => (
                    <tr key={row.semesters}>
                      <td><strong>{row.semesters}학기</strong></td>
                      <td className="num">{row.total.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="admin-subhead">전공 분포<small>1·2·3전공 어디에 뒀는지까지</small></h2>
            {overview.profiles.byMajor.length === 0 ? (
              <p className="admin-empty">아직 저장된 전공이 없어요.</p>
            ) : (
              <div className="admin-scroll">
                <table className="admin-table">
                  <thead><tr><th>전공</th><th>1전공</th><th>2전공</th><th>3전공</th><th>합계</th></tr></thead>
                  <tbody>
                    {overview.profiles.byMajor.map((row) => (
                      <tr key={row.major}>
                        <td><strong>{row.major}</strong></td>
                        <td className="num">{row.first || "–"}</td>
                        <td className="num">{row.second || "–"}</td>
                        <td className="num">{row.third || "–"}</td>
                        <td className="num"><strong>{row.total.toLocaleString("ko-KR")}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="admin-subhead">
              단위별 이벤트
              <small>선택 동의를 한 {overview.users.consented.toLocaleString("ko-KR")}명만 들어갑니다</small>
            </h2>
            <div className="admin-filters" role="tablist" aria-label="이벤트 묶는 단위">
              {UNITS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={unit === item.key}
                  className={unit === item.key ? "active" : ""}
                  onClick={() => setUnit(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {matrix.rows.length === 0 ? (
              <p className="admin-empty">아직 기록된 이벤트가 없어요.</p>
            ) : (
              <div className="admin-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{UNITS.find((item) => item.key === unit)!.label}</th>
                      {matrix.columns.map((event) => <th key={event}>{EVENT_LABEL.get(event) ?? event}</th>)}
                      <th>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.key ?? "none"}>
                        <td><strong>{unitLabel(row.key)}</strong></td>
                        {matrix.columns.map((event) => (
                          <td className="num" key={event}>{row.byEvent.get(event)?.toLocaleString("ko-KR") ?? "–"}</td>
                        ))}
                        <td className="num"><strong>{row.total.toLocaleString("ko-KR")}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="admin-subhead">
              흐름
              <small>동의한 {overview.users.consented.toLocaleString("ko-KR")}명이 어디까지 왔는지</small>
            </h2>
            {reach.length === 0 ? (
              <p className="admin-empty">아직 이어볼 기록이 없어요. 선택 동의를 한 사람이 쓰기 시작하면 채워집니다.</p>
            ) : (
              <>
                <ol className="admin-funnel">
                  {reach.map((step, index) => (
                    <li key={step.event}>
                      <span className="funnel-label">{EVENT_LABEL.get(step.event) ?? step.event}</span>
                      <span className="funnel-bar"><i style={{ width: `${step.share}%` }} /></span>
                      <span className="funnel-count">
                        {step.people.toLocaleString("ko-KR")}명
                        {index > 0 && <small>{step.dropped > 0 ? `−${step.dropped}` : "유지"}</small>}
                      </span>
                    </li>
                  ))}
                </ol>

                <h2 className="admin-subhead">많이 걸은 길<small>같은 순서로 움직인 사람 수</small></h2>
                {overview.flow.journeys.length === 0 ? (
                  <p className="admin-empty">아직 기록이 없어요.</p>
                ) : (
                  <ul className="admin-journeys">
                    {overview.flow.journeys.map((journey) => (
                      <li key={journey.steps.join(">")}>
                        <span className="journey-people">{journey.people.toLocaleString("ko-KR")}명</span>
                        <span className="journey-path">
                          {journey.steps.map((step, index) => (
                            <span key={`${step}-${index}`}>
                              {index > 0 && <i aria-hidden="true">→</i>}
                              {EVENT_LABEL.get(step) ?? step}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <h2 className="admin-subhead">
              최근 로그
              <small>
                익명 이벤트 {logTotal.toLocaleString("ko-KR")}건
                {logTotal > log.length && ` 중 ${log.length.toLocaleString("ko-KR")}건`}
              </small>
            </h2>
            {log.length === 0 ? (
              <p className="admin-empty">기록이 없어요.</p>
            ) : (
              <ul className="admin-log">
                {log.map((row) => (
                  <li key={row.id}>
                    <time>{new Date(row.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
                    <strong>{EVENT_LABEL.get(row.event) ?? row.event}</strong>
                    {row.resultBucket && <em>{BUCKET_LABEL.get(row.resultBucket) ?? row.resultBucket}</em>}
                    {row.college && <em>{COLLEGE_LABEL.get(row.college) ?? row.college}</em>}
                    {row.major && <em>{row.major}</em>}
                    {row.cohortYear && <em>{String(row.cohortYear).slice(2)}학번</em>}
                    {row.completedSemesters !== null && <em>{row.completedSemesters}학기</em>}
                  </li>
                ))}
              </ul>
            )}
            {logHasMore && (
              <div className="admin-more">
                <button type="button" onClick={() => void loadMoreLog()} disabled={logBusy}>
                  {logBusy ? "불러오는 중…" : `더 보기 (${(logTotal - log.length).toLocaleString("ko-KR")}건 남음)`}
                </button>
              </div>
            )}

            <div className="admin-danger">
              <div>
                <strong>로그 정리</strong>
                <small>전체 초기화는 되돌릴 수 없어요. 공개 전 시험 기록을 비울 때만 쓰세요. 사용자 설정(user_profiles)과 건의는 지우지 않습니다.</small>
                {purgeMessage && <small className="admin-purge-done" role="status">{purgeMessage}</small>}
              </div>
              <div className="admin-danger-actions">
                <button type="button" onClick={() => void purgeEvents("old")} disabled={busy}>30일 지난 것만</button>
                <button type="button" className="danger" onClick={() => void purgeEvents("all")} disabled={busy}>전체 초기화</button>
              </div>
            </div>

            <p className="admin-note">
              서버 예외와 요청 로그는 앱이 아니라 Vercel 함수 로그에 남습니다 — <code>vercel logs</code> 또는 Vercel 대시보드 Logs 탭에서 보세요.
              여기 있는 건 앱이 직접 남긴 이벤트입니다. 소속·1전공·입학연도는 설정 화면에서 선택 동의를 한 사람에게만 붙고,
              동의하지 않은 사람은 이벤트 이름과 묶음 값만 남아 위 표의 &ldquo;미선택&rdquo;에 모입니다.
              방문자 ID는 어느 경우에도 붙이지 않아 기록끼리 이어 한 사람을 따라갈 수 없습니다.
            </p>
          </>
        )
      ) : (
      <>
      <div className="admin-filters" role="tablist" aria-label="처리 상태">
        {[{ key: "all", label: "전체" }, ...STATUS_FLOW].map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={filter === item.key}
            className={filter === item.key ? "active" : ""}
            onClick={() => setFilter(item.key)}
          >
            {item.label}<span>{item.key === "all" ? messages.length : counts.get(item.key) ?? 0}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="admin-empty">아직 받은 건의가 없어요.</p>
      ) : (
        <ul className="admin-list">
          {shown.map((item) => (
            <li key={item.id} className={`admin-item ${item.status}`}>
              <div className="admin-item-head">
                <strong>{CATEGORY_LABEL.get(item.category) ?? item.category}</strong>
                <span>
                  {item.cohortYear ? `${String(item.cohortYear).slice(2)}학번` : "학번 미입력"}
                  {item.college ? ` · ${COLLEGE_LABEL.get(item.college) ?? item.college}` : ""}
                  {" · "}
                  {new Date(item.createdAt).toLocaleString("ko-KR")}
                </span>
              </div>
              <p>{item.message}</p>
              <div className="admin-item-actions">
                {STATUS_FLOW.map((status) => (
                  <button
                    key={status.key}
                    type="button"
                    className={item.status === status.key ? "active" : ""}
                    onClick={() => void setStatus(item.id, status.key)}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </main>
  );
}
