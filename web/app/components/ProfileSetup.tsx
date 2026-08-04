"use client";

import { FormEvent, KeyboardEvent, useId, useMemo, useState } from "react";
import Link from "next/link";
import { majorOptions, normalizeMajorSearch } from "../data/major-options";
import { FIRST_BULLETIN_YEAR, LAST_BULLETIN_YEAR, collegesFor } from "../data/core-curriculum.mjs";

export type UserProfile = {
  cohortYear: number;
  completedSemesters: number;
  college: string | null;
  major1: string;
  major2: string | null;
  major3: string | null;
  major2Approved: boolean;
  major3Approved: boolean;
  enrolled: boolean;
  analyticsConsent: boolean;
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
  const [cohortYear, setCohortYear] = useState(initialProfile?.cohortYear ?? LAST_BULLETIN_YEAR);
  const [completedSemesters, setCompletedSemesters] = useState(initialProfile?.completedSemesters ?? 0);
  const [college, setCollege] = useState(initialProfile?.college ?? "");
  const [major1, setMajor1] = useState(initialProfile?.major1 ?? "");
  const [major2, setMajor2] = useState(initialProfile?.major2 ?? "");
  const [major3, setMajor3] = useState(initialProfile?.major3 ?? "");
  const [major2Approved, setMajor2Approved] = useState(initialProfile?.major2Approved ?? true);
  const [major3Approved, setMajor3Approved] = useState(initialProfile?.major3Approved ?? true);
  const [enrolled, setEnrolled] = useState(initialProfile?.enrolled ?? true);
  // 선택 동의는 미리 체크해 두지 않습니다 — 눌러 둔 동의는 동의가 아닙니다.
  const [analyticsConsent, setAnalyticsConsent] = useState(initialProfile?.analyticsConsent ?? false);
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
        body: JSON.stringify({
          cohortYear, completedSemesters, college: college || null,
          major1, major2: major2 || null, major3: major3 || null,
          major2Approved, major3Approved, enrolled, analyticsConsent,
        }),
      });
      const data = (await response.json()) as { profile?: UserProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "저장하지 못했어요.");
      onSaved(data.profile);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "저장하지 못했어요.");
    }
  }

  // 설정 전 기본값은 가장 최근 요람(26학번)이고, 보유한 요람보다 이전 학번도 고를 수 있게 4년 더 둡니다.
  const cohortYears = Array.from(
    { length: LAST_BULLETIN_YEAR - FIRST_BULLETIN_YEAR + 5 },
    (_, index) => LAST_BULLETIN_YEAR - index,
  );
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
          <label className="approval-row">
            <input type="checkbox" checked={!enrolled} onChange={(event) => setEnrolled(!event.target.checked)} />
            <span>
              <strong>지금 수강신청할 재학생은 아니에요</strong>
              <small>졸업했거나 프로젝트가 궁금해서 둘러보는 경우예요. 화면은 똑같이 쓸 수 있고, 사용 집계에서만 따로 셉니다.</small>
            </span>
          </label>
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
          {major2 && (
            <label className="approval-row">
              <input type="checkbox" checked={major2Approved} onChange={(event) => setMajor2Approved(event.target.checked)} />
              <span><strong>2전공 복수전공 신청을 마쳤어요</strong><small>복수전공 신청 전이면 체크를 풀어주세요. 아직 수강신청할 수 없는 과목들은 시간표에서 제외해드려요.</small></span>
            </label>
          )}
          <MajorCombobox label="3전공" value={major3} onChange={setMajor3} />
          {major3 && (
            <label className="approval-row">
              <input type="checkbox" checked={major3Approved} onChange={(event) => setMajor3Approved(event.target.checked)} />
              <span><strong>3전공 복수전공 신청을 마쳤어요</strong><small>복수전공 신청 전이면 체크를 풀어주세요. 아직 수강신청할 수 없는 과목들은 시간표에서 제외해드려요.</small></span>
            </label>
          )}
          <div className="profile-data-note">
            <strong>어떤 정보가 저장되나요?</strong>
            <p>
              입학 연도, 이수학기 수, 소속 대학, 선택 전공, 재학 여부와 익명 브라우저 ID만 저장합니다.
              이름·전체 학번·IP는 저장하지 않아요. <Link href="/privacy" target="_blank" rel="noreferrer">자세히 보기 ↗</Link>
            </p>
          </div>
          {!initialProfile && (
            <label className="consent-row">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
              <span><strong>(필수)</strong> 위 정보를 저장해 내 전공에 맞는 시간표를 만드는 데 동의합니다.</span>
            </label>
          )}
          <label className="consent-row optional">
            <input type="checkbox" checked={analyticsConsent} onChange={(event) => setAnalyticsConsent(event.target.checked)} />
            <span>
              <strong>(선택)</strong> 어떤 기능을 썼는지에 <b>소속 대학·1전공·입학연도</b>를 함께 남겨도 좋습니다.
              <small>
                어느 전공·학번이 무엇을 필요로 하는지 보고 다음 학기에 고치는 데만 씁니다.
                해당하는 사람이 적은 조합에서는 이 기록으로 누구인지 짐작될 수 있습니다.
                동의하지 않아도 모든 기능을 똑같이 쓸 수 있고, 그때는 어떤 기능이 몇 번 쓰였는지만 남습니다.
                설정을 다시 열어 언제든 바꿀 수 있어요.
              </small>
            </span>
          </label>
          {message && <p className="profile-error" role="alert">{message}</p>}
          <button className="profile-submit" type="submit" disabled={!consent || state === "saving"}>
            {state === "saving" ? "저장하는 중…" : initialProfile ? "수정 내용 저장" : "내 시간표 시작하기"}
          </button>
        </form>
      </section>
    </div>
  );
}
