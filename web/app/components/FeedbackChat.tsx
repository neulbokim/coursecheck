"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { FEEDBACK_MAX_LENGTH, FEEDBACK_MIN_LENGTH, feedbackCategories } from "../lib/feedback.mjs";

type Category = { key: string; label: string; hint: string };
type Bubble = { from: "bot" | "me"; text: string };

const CATEGORIES: Category[] = feedbackCategories;
const OPENING: Bubble[] = [
  { from: "bot", text: "안녕하세요, 남겨주신 의견은 제가 직접 읽습니다." },
  { from: "bot", text: "어떤 이야기를 남기고 싶으세요?" },
];

export default function FeedbackChat({ onClose }: { onClose: () => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>(OPENING);
  const [category, setCategory] = useState<Category | null>(null);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, state]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function chooseCategory(chosen: Category) {
    setCategory(chosen);
    setBubbles([
      ...OPENING,
      { from: "me", text: chosen.label },
      { from: "bot", text: `${chosen.hint} 같은 내용이면 좋아요. 편하게 적어주세요.` },
      { from: "bot", text: "답장은 드리지 못하지만, 개설 데이터나 요람 정보가 틀렸다면 확인해서 고칠게요." },
    ]);
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!category || message.length < FEEDBACK_MIN_LENGTH) {
      setError(`${FEEDBACK_MIN_LENGTH}자 이상 적어주세요.`);
      return;
    }
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: category.key, message }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "건의를 보내지 못했어요.");
      setBubbles((current) => [
        ...current,
        { from: "me", text: message },
        { from: "bot", text: "잘 받았어요. 읽고 반영할 수 있는 건 반영하겠습니다. 감사합니다!" },
      ]);
      setDraft("");
      setState("sent");
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "건의를 보내지 못했어요.");
    }
  }

  function again() {
    setBubbles(OPENING);
    setCategory(null);
    setDraft("");
    setState("idle");
    setError("");
  }

  return (
    <div className="feedback-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="feedback-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="feedback-head">
          <span className="feedback-avatar" aria-hidden="true">C</span>
          <div>
            <strong id="feedback-title">개발자에게 건의하기</strong>
            <small>단방향 접수 · 답장은 드리지 않아요</small>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div className="feedback-log" ref={logRef} role="log" aria-live="polite">
          {bubbles.map((bubble, index) => (
            <p className={`feedback-bubble ${bubble.from}`} key={`${bubble.from}-${index}`}>{bubble.text}</p>
          ))}
          {state === "sending" && <p className="feedback-bubble bot typing" aria-label="보내는 중">● ● ●</p>}
        </div>

        {!category ? (
          <div className="feedback-choices">
            {CATEGORIES.map((item) => (
              <button key={item.key} type="button" onClick={() => chooseCategory(item)}>
                <strong>{item.label}</strong><small>{item.hint}</small>
              </button>
            ))}
          </div>
        ) : state === "sent" ? (
          <div className="feedback-done">
            <button type="button" onClick={again}>다른 의견도 남기기</button>
            <button type="button" className="ghost" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={send}>
            {error && <p className="feedback-error" role="alert">{error}</p>}
            <textarea
              ref={inputRef}
              aria-label="건의 내용"
              placeholder="예: 2026-2 개설과목에 OOO이 빠진 것 같아요"
              maxLength={FEEDBACK_MAX_LENGTH}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit();
              }}
              disabled={state === "sending"}
            />
            <div className="feedback-actions">
              <small>{draft.trim().length}/{FEEDBACK_MAX_LENGTH} · ⌘+Enter로 보내기</small>
              <button className="primary-button" disabled={state === "sending" || draft.trim().length < FEEDBACK_MIN_LENGTH}>
                {state === "sending" ? "보내는 중…" : "보내기"}
              </button>
            </div>
            <p className="feedback-note">적어주신 내용과 익명 브라우저 ID만 저장합니다. 이름·연락처는 받지 않아요.</p>
          </form>
        )}
      </section>
    </div>
  );
}
