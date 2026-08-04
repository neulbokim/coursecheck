"use client";

import { FormEvent, KeyboardEvent, useId, useMemo, useState } from "react";
import { majorOptions, normalizeMajorSearch } from "../data/major-options";
import { collegesFor } from "../data/core-curriculum.mjs";

export type UserProfile = {
  cohortYear: number;
  completedSemesters: number;
  college: string | null;
  major1: string;
  major2: string | null;
  major3: string | null;
};

type Props = {
  initialProfile: UserProfile | null;
  onClose?: () => void;
  onSaved: (profile: UserProfile) => void;
};

function MajorCombobox({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => {
    const normalized = normalizeMajorSearch(query);
    const source = normalized
      ? majorOptions.filter((major) => normalizeMajorSearch(major).includes(normalized))
      : majorOptions;
    return source.slice(0, 7);
  }, [query]);

  function choose(major: string) {
    setQuery(major);
    onChange(major);
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && matches[activeIndex]) {
      event.preventDefault();
      choose(matches[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="profile-field major-combobox">
      <label htmlFor={inputId}>{label}{required ? <span>필수</span> : <small>선택</small>}</label>
      <input
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={required ? "예: 국어국문학과" : "전공이 있다면 검색"}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
          setActiveIndex(0);
        }}
        required={required}
      />
      {open && (
        <div className="major-options" id={listId} role="listbox">
          {matches.length ? matches.map((major, index) => (
            <button
              id={`${listId}-${index}`}
              className={index === activeIndex ? "active" : ""}
              key={major}
              type="button"
              role="option"
              aria-selected={value === major}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(major)}
            >
              <span>{major}</span><small>선택</small>
            </button>
          )) : <p>일치하는 전공이 없어요.</p>}
        </div>
      )}
    </div>
  );
}

export default function ProfileSetup({ initialProfile, onClose, onSaved }: Props) {
  const [cohortYear, setCohortYear] = useState(initialProfile?.cohortYear ?? 2026);
  const [completedSemesters, setCompletedSemesters] = useState(initialProfile?.completedSemesters ?? 0);
  const [college, setCollege] = useState(initialProfile?.college ?? "");
  const [major1, setMajor1] = useState(initialProfile?.major1 ?? "");
  const [major2, setMajor2] = useState(initialProfile?.major2 ?? "");
  const [major3, setMajor3] = useState(initialProfile?.major3 ?? "");
  const [consent, setConsent] = useState(Boolean(initialProfile));
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!major1) {
      setState("error");
      setMessage("1전공은 검색 결과에서 선택해 주세요.");
      return;
    }
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cohortYear, completedSemesters, college: college || null, major1, major2: major2 || null, major3: major3 || null }),
      });
      const data = (await response.json()) as { profile?: UserProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "저장하지 못했어요.");
      onSaved(data.profile);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "저장하지 못했어요.");
    }
  }

  const cohortYears = Array.from({ length: 15 }, (_, index) => 2026 - index);
  const semesterCounts = Array.from({ length: 17 }, (_, index) => index);
  const collegeOptions: Array<{ key: string; label: string }> = collegesFor(cohortYear);
  const collegeMissing = Boolean(college) && !collegeOptions.some((option) => option.key === college);

  return (
    <div className="profile-backdrop">
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        {initialProfile && onClose && <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>}
        <div className="profile-intro">
          <span className="profile-step">처음 한 번만</span>
          <h2 id="profile-title">내 전공에 맞게 시작할게요.</h2>
          <p>입학 연도에 맞는 요람과 전공 과목을 연결하기 위한 기본 설정입니다.</p>
        </div>
        <form className="profile-form" onSubmit={submit}>
          <div className="profile-row">
            <div className="profile-field">
              <label htmlFor="cohort-year">학번<span>필수</span></label>
              <select id="cohort-year" value={cohortYear} onChange={(event) => setCohortYear(Number(event.target.value))}>
                {cohortYears.map((year) => <option key={year} value={year}>{String(year).slice(2)}학번</option>)}
              </select>
              {collegeMissing && <small className="profile-hint">이 학번에는 없는 소속이라 다시 선택해 주세요.</small>}
            </div>
            <div className="profile-field">
              <label htmlFor="completed-semesters">이수학기 수<span>필수</span></label>
              <select id="completed-semesters" value={completedSemesters} onChange={(event) => setCompletedSemesters(Number(event.target.value))}>
                {semesterCounts.map((semester) => <option key={semester} value={semester}>{semester}학기</option>)}
              </select>
            </div>
          </div>
          <div className="profile-field">
            <label htmlFor="college">소속 대학<small>선택</small></label>
            <select id="college" value={collegeMissing ? "" : college} onChange={(event) => setCollege(event.target.value)}>
              <option value="">선택하지 않음 (계열 판정 없이 진행)</option>
              {collegeOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <small className="profile-hint">글쓰기 계열과 요람의 영역별 필수선택(미적분학Ⅰ 등)을 자동으로 골라줍니다.</small>
          </div>
          <MajorCombobox label="1전공" required value={major1} onChange={setMajor1} />
          <MajorCombobox label="2전공" value={major2} onChange={setMajor2} />
          <MajorCombobox label="3전공" value={major3} onChange={setMajor3} />
          <div className="profile-data-note">
            <strong>어떤 정보가 저장되나요?</strong>
            <p>입학 연도, 이수학기 수, 소속 대학, 선택 전공과 익명 브라우저 ID만 저장합니다. 이름·전체 학번·IP는 저장하지 않아요.</p>
            <p>사용자 수는 브라우저 기준이라 실제 인원과 조금 다를 수 있습니다.</p>
          </div>
          {!initialProfile && (
            <label className="consent-row">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
              위 정보를 서비스 개선과 익명 사용자 집계 목적으로 저장하는 데 동의합니다.
            </label>
          )}
          {message && <p className="profile-error" role="alert">{message}</p>}
          <button className="profile-submit" type="submit" disabled={!consent || state === "saving"}>
            {state === "saving" ? "저장하는 중…" : initialProfile ? "수정 내용 저장" : "내 시간표 시작하기"}
          </button>
        </form>
      </section>
    </div>
  );
}
