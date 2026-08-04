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
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchMessages = useCallback(async () => {
    const response = await fetch("/api/admin/feedback", { cache: "no-store" });
    if (response.status === 401) return { signedIn: false, messages: [] as Message[] };
    const data = (await response.json()) as { messages?: Message[]; error?: string };
    if (!response.ok) throw new Error(data.error || "불러오지 못했어요.");
    return { signedIn: true, messages: data.messages ?? [] };
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await fetchMessages();
      setSignedIn(result.signedIn);
      setMessages(result.messages);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  }, [fetchMessages]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchMessages();
        if (cancelled) return;
        setSignedIn(result.signedIn);
        setMessages(result.messages);
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchMessages]);

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

      {error && <p className="feedback-error" role="alert">{error}</p>}

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
    </main>
  );
}
