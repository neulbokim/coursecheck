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
  users: { total: number; last24h: number };
  events: Array<{ event: string; total: number; last24h: number }>;
  feedback: Array<{ status: string; total: number }>;
  recent: Array<{ id: number; event: string; majorKey: string | null; resultBucket: string | null; createdAt: string }>;
};

/** 이벤트 이름을 사람이 읽을 말로 */
const EVENT_LABEL = new Map<string, string>([
  ["page_view", "첫 화면 열기"],
  ["profile_saved", "전공 설정 저장"],
  ["results_view", "개설 시간표 확인"],
  ["everytime_import", "에브리타임 가져오기"],
  ["everytime_import_error", "에브리타임 실패"],
  ["course_pick", "과목 담기"],
  ["ge_mode", "교양 표시 전환"],
  ["feedback_open", "건의 창 열기"],
]);

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    const [feedbackResponse, overviewResponse, coursesResponse] = await Promise.all([
      fetch("/api/admin/feedback", { cache: "no-store" }),
      fetch("/api/admin/overview", { cache: "no-store" }),
      fetch("/api/admin/courses", { cache: "no-store" }),
    ]);
    if (feedbackResponse.status === 401 || overviewResponse.status === 401) {
      return { signedIn: false, messages: [] as Message[], overview: null, datasets: [] as Dataset[] };
    }
    const feedbackData = (await feedbackResponse.json()) as { messages?: Message[]; error?: string };
    if (!feedbackResponse.ok) throw new Error(feedbackData.error || "불러오지 못했어요.");
    const overviewData = overviewResponse.ok ? ((await overviewResponse.json()) as Overview) : null;
    const coursesData = coursesResponse.ok ? ((await coursesResponse.json()) as { datasets?: Dataset[] }) : null;
    return {
      signedIn: true,
      messages: feedbackData.messages ?? [],
      overview: overviewData,
      datasets: coursesData?.datasets ?? [],
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

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of messages) map.set(item.status, (map.get(item.status) ?? 0) + 1);
    return map;
  }, [messages]);
  const shown = filter === "all" ? messages : messages.filter((item) => item.status === filter);

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
          집계·로그{overview && <span>{overview.recent.length}</span>}
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
              <div className="stat-card"><small>설정 완료 사용자</small><strong>{overview.users.total.toLocaleString("ko-KR")}</strong><em>24시간 +{overview.users.last24h}</em></div>
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

            <h2 className="admin-subhead">최근 로그<small>익명 이벤트 {overview.recent.length}건</small></h2>
            {overview.recent.length === 0 ? (
              <p className="admin-empty">기록이 없어요.</p>
            ) : (
              <ul className="admin-log">
                {overview.recent.map((row) => (
                  <li key={row.id}>
                    <time>{new Date(row.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
                    <strong>{EVENT_LABEL.get(row.event) ?? row.event}</strong>
                    {row.resultBucket && <em>{row.resultBucket}</em>}
                    {row.majorKey && <em>{row.majorKey}</em>}
                  </li>
                ))}
              </ul>
            )}

            <p className="admin-note">
              서버 예외와 요청 로그는 앱이 아니라 Vercel 함수 로그에 남습니다 — <code>vercel logs</code> 또는 Vercel 대시보드 Logs 탭에서 보세요.
              여기 있는 건 앱이 직접 남긴 익명 이벤트입니다(개인 식별 정보 없음).
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
