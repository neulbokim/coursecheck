import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { extractEverytimeUrl } from "../app/lib/everytime-link.mjs";
import { groupTimetableEntries } from "../app/lib/timetable-layout.mjs";

test("discovers every public semester identifier in an Everytime response", async () => {
  const { extractSemesterReferences } = await import("../app/lib/everytime-timetable.mjs");
  const xml = `<?xml version="1.0"?><response><primaryTables>
    <primaryTable identifier="currentIdentifier123" year="2026" semester="2" />
    <primaryTable identifier="summerIdentifier123" year="2026" semester="여름" />
    <primaryTable identifier="pastIdentifier123456" year="2025" semester="2" />
  </primaryTables><table identifier="currentIdentifier123" year="2026" semester="2" /></response>`;
  assert.deepEqual(extractSemesterReferences(xml), [
    { identifier: "currentIdentifier123", year: "2026", semester: "2" },
    { identifier: "summerIdentifier123", year: "2026", semester: "여름" },
    { identifier: "pastIdentifier123456", year: "2025", semester: "2" },
  ]);
});

test("extracts an Everytime timetable URL from the copied share message", () => {
  const url = "https://everytime.kr/app/@A1b2C3d4E5f6G7h8";
  const copied = `에브리타임에서 친구의 2026년 2학기 시간표를 확인해보세요!\n${url}`;
  assert.equal(extractEverytimeUrl(copied), url);
  assert.equal(extractEverytimeUrl(url), url);
  assert.equal(
    extractEverytimeUrl("https://www.everytime.kr/@A1b2C3d4E5f6G7h8"),
    "https://www.everytime.kr/@A1b2C3d4E5f6G7h8",
  );
});

test("groups timetable entries into fixed weekday columns by time slot", () => {
  const entries = [
    { id: "a", meeting: { day: "월", start: 540, end: 630 } },
    { id: "b", meeting: { day: "월", start: 540, end: 630 } },
    { id: "c", meeting: { day: "화", start: 540, end: 630 } },
    { id: "d", meeting: { day: "월", start: 630, end: 720 } },
  ];
  const slots = groupTimetableEntries(entries, ["월", "화"]);
  assert.equal(slots.length, 2);
  assert.deepEqual(slots[0].byDay["월"].map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(slots[0].byDay["화"].map((entry) => entry.id), ["c"]);
  assert.deepEqual(slots[1].byDay["월"].map((entry) => entry.id), ["d"]);
});

test("keeps the timetable within the viewport and lists courses by time slot", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /boardWidth|LANE_WIDTH|layoutTimetableEntries/);
  assert.match(page, /groupTimetableEntries/);
  assert.match(page, /course\.name.*course\.professor/s);
  assert.match(css, /grid-template-columns:\s*minmax\([^;]+repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(css, /\.course-line[^}]*text-overflow:\s*ellipsis/s);
});

test("defines the CourseCheck product page and social metadata", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /<html lang="ko">/);
  assert.match(layout, /CourseCheck \| 서강대 전공 시간표/);
  assert.match(layout, /new URL\("\/og\.png", baseUrl\)/);
  assert.match(page, /내 전공으로 이번 학기/);
  assert.match(page, /2026학년도 2학기/);
  assert.match(page, /useState<string\[\]>\(\["BDS"\]\)/);
  assert.match(page, /이전 학기 시간표까지 모두/);
  assert.match(page, /추가로 제외할 과목/);
  assert.match(page, /필수 교양 이수 확인/);
  assert.match(page, /개설 시간표 확인하기/);
  assert.match(page, /개발자에게 건의하기/);
  assert.doesNotMatch(page, /className="major-chip"/);
  assert.doesNotMatch(page, /전공 선택 확인|profile-summary/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("uses the official Sogang UI color system", async () => {
  const [css, majors] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/data/majors.ts", import.meta.url), "utf8"),
  ]);
  // 메인 컬러: 서강 카디널 · 서브 컬러와 무채색은 공식 UI 가이드 값
  assert.match(css, /--cardinal:\s*#861f1c/);
  assert.match(css, /--ink:\s*#231815/);
  assert.match(css, /--wine:\s*var\(--cardinal\)/, "기존 변수는 공식 메인 컬러를 가리킨다");
  for (const sub of ["#e3540b", "#6f9453", "#005783", "#004f8e", "#5c2976"]) {
    assert.ok(css.includes(sub), `서브 컬러 ${sub}가 정의되어 있어야 한다`);
  }
  // 이전 팔레트(자주색 계열)는 남아 있지 않아야 한다
  assert.doesNotMatch(`${css}\n${majors}`, /#8b1e3f|#67142e|#8a203d|#c26532|#345995|#1f6b5c/i);
  assert.match(majors, /#861f1c/);
});

test("self-hosts Pretendard and uses it as the single UI typeface", async () => {
  const [layout, css, packageText] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /pretendardvariable\.css/);
  assert.match(css, /"Pretendard Variable"/);
  assert.doesNotMatch(css, /Georgia|Times New Roman|ui-monospace|monospace/);
  assert.match(packageText, /"pretendard"/);
});

test("ships normalized course and linked-major data", async () => {
  const [coursesText, majorsText, packageText, pageText] = await Promise.all([
    readFile(new URL("../app/data/courses.generated.json", import.meta.url), "utf8"),
    readFile(new URL("../app/data/majors.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  const courses = JSON.parse(coursesText);
  assert.equal(courses.length, 1482);
  assert.ok(courses.some((course) => course.code === "BDS4010"));
  assert.match(majorsText, /빅데이터사이언스 연계전공/);
  assert.match(majorsText, /sourceUrl/);
  assert.doesNotMatch(packageText, /react-loading-skeleton/);
  assert.doesNotMatch(pageText, /김현서|w7rWjriN0rk1P1o6Fmlv/);
  await access(new URL("../public/og.png", import.meta.url));
});

test("tracks required general-education areas per bulletin year", async () => {
  const { bulletinYearFor, coreTracksFor, coreTrackCodeMap, detectCompletedTrackKeys } = await import(
    "../app/data/core-curriculum.mjs"
  );

  assert.equal(bulletinYearFor(2013), 2016, "2016년보다 이전 학번은 보유한 첫 요람으로 안내한다");
  assert.equal(bulletinYearFor(2016), 2016);
  assert.equal(bulletinYearFor(2026), 2026);

  const codesFor = (tracks, key) => tracks.find((track) => track.key === key)?.courses.flatMap((course) => course.codes) ?? [];
  const labels = (year) => coreTracksFor(year).map((track) => track.label);

  // 2019 요람부터 「공통필수·공통선택」 체계
  const tracks2022 = coreTracksFor(2022);
  const tracks2026 = coreTracksFor(2026);
  assert.deepEqual(
    labels(2026),
    ["서강인성", "글쓰기", "글로벌 언어Ⅰ", "전공·진로 탐색", "소프트웨어", "① 인간과 신앙", "② 인간과 사상", "③ 인간과 사회", "④ 인간과 과학 & AI"],
  );
  assert.equal(tracks2026.filter((track) => track.group === "공통선택").length, 4);

  assert.ok(codesFor(tracks2026, "thought").includes("ETS2005"), "26학번 ② 영역에는 AI와 휴머니즘이 포함된다");
  assert.ok(!codesFor(tracks2022, "thought").includes("ETS2005"));
  assert.ok(!codesFor(tracks2022, "thought").includes("HSS3032"));
  assert.ok(codesFor(coreTracksFor(2025), "thought").includes("HSS3032"));
  assert.ok(codesFor(tracks2026, "society").includes("SHS2012"));
  assert.ok(!codesFor(tracks2022, "society").includes("SHS2012"));
  assert.ok(codesFor(tracks2026, "science").includes("STS2015"));
  assert.ok(!codesFor(coreTracksFor(2024), "science").includes("STS2015"));

  // 소프트웨어 영역: 2019~2020 컴퓨팅 사고력 → 2021 없음 → 2022~ 기초인공지능프로그래밍
  assert.deepEqual(codesFor(coreTracksFor(2020), "software"), ["COR1009", "COR1011"]);
  assert.ok(!labels(2021).includes("소프트웨어"), "21학번 공통필수에는 소프트웨어 영역이 없다");
  assert.deepEqual(codesFor(coreTracksFor(2022), "software"), ["COR1010"]);

  // 2016~2018 요람은 「중핵필수·중핵필수선택」 7영역 체계
  const tracks2018 = coreTracksFor(2018);
  assert.equal(tracks2018.filter((track) => track.group === "중핵필수선택").length, 7);
  assert.ok(labels(2018).includes("읽기와 쓰기"));
  assert.ok(!labels(2018).includes("글쓰기"), "글쓰기 영역은 2019 요람부터다");
  assert.ok(labels(2018).includes("⑦ 사고와 언어 표현의 탐구"));
  assert.ok(codesFor(tracks2018, "expression").includes("TLS1001"));
  assert.ok(codesFor(coreTracksFor(2016), "science").includes("STS2003"), "공학과 기술의 이해는 2016 요람에만 있다");
  assert.ok(!codesFor(coreTracksFor(2017), "science").includes("STS2003"));
  assert.ok(!codesFor(coreTracksFor(2016), "science").includes("STS2011"));
  assert.ok(codesFor(coreTracksFor(2017), "science").includes("STS2011"));
  assert.ok(codesFor(tracks2018, "worldLanguage").includes("LCS2009"), "한국어와 문화Ⅰ은 2018 요람부터다");
  assert.ok(!codesFor(coreTracksFor(2017), "worldLanguage").includes("LCS2009"));

  const byCode = coreTrackCodeMap(tracks2026);
  assert.equal(byCode.get("HFS2001"), "faith");
  assert.equal(byCode.get("STS2005"), "science");
  assert.equal(byCode.get("COR1005"), "language", "영어글로벌의사소통Ⅰ(고급)도 같은 영역으로 본다");
  assert.equal(byCode.get("CSE4187"), undefined);

  const completed = detectCompletedTrackKeys(tracks2026, [
    "철학적인간학",
    "법과 지식산업",
    "우주와원자시대",
    "영어글로벌의사소통I(고급)",
    "자료구조",
  ]);
  assert.ok(completed.has("faith"));
  assert.ok(completed.has("society"), "과거 과목명(법과 지식산업)도 이수로 본다");
  assert.ok(completed.has("science"), "과거 과목명(우주와 원자시대)도 이수로 본다");
  assert.ok(completed.has("language"));
  assert.ok(!completed.has("thought"));
});

test("narrows required areas by the student's college", async () => {
  const { collegesFor, coreTracksFor } = await import("../app/data/core-curriculum.mjs");

  const codesFor = (tracks, key) => tracks.find((track) => track.key === key)?.courses.flatMap((c) => c.codes) ?? [];

  // 자유전공학부는 2025 요람부터 존재한다
  assert.ok(!collegesFor(2022).some((college) => college.key === "freeScience"));
  assert.ok(collegesFor(2026).some((college) => college.key === "freeScience"));

  // 글쓰기: 계열별 1과목
  assert.deepEqual(codesFor(coreTracksFor(2026, "humanities"), "writing"), ["COR1012"]);
  assert.deepEqual(codesFor(coreTracksFor(2026, "engineering"), "writing"), ["COR1013"]);
  assert.deepEqual(codesFor(coreTracksFor(2026, null), "writing"), ["COR1012", "COR1013"], "소속을 모르면 둘 다 남긴다");

  // ④ 영역: 자연과학·공과·소프트웨어융합대학은 미적분학Ⅰ 필수선택
  const engineering = coreTracksFor(2026, "engineering").find((track) => track.key === "science");
  assert.deepEqual(engineering.courses.map((course) => course.codes[0]), ["STS2005"]);
  assert.match(engineering.pinnedNote, /공과대학/);

  // SCIENCE기반 자유전공학부는 과학도를 위한 파이썬, 인문학기반은 인문학의 세계
  assert.deepEqual(codesFor(coreTracksFor(2026, "freeScience"), "science"), ["STS2015"]);
  assert.deepEqual(codesFor(coreTracksFor(2026, "freeHumanities"), "thought"), ["HSS3032"]);

  // 지정이 없는 소속은 영역 과목을 그대로 둔다
  assert.ok(codesFor(coreTracksFor(2026, "humanities"), "science").length > 1);
  assert.equal(coreTracksFor(2026, "humanities").find((track) => track.key === "science").pinnedNote, undefined);
});

test("matches every bulletin course code against the current offering data", async () => {
  const [{ coreTracksFor }, coursesText] = await Promise.all([
    import("../app/data/core-curriculum.mjs"),
    readFile(new URL("../app/data/courses.generated.json", import.meta.url), "utf8"),
  ]);
  const courses = JSON.parse(coursesText);
  const offeredByCode = new Map(courses.map((course) => [course.code, course.name]));
  const { normalizeCourseName } = await import("../app/lib/course-name.mjs");

  for (const track of coreTracksFor(2026)) {
    for (const course of track.courses) {
      const offeredCode = course.codes.find((code) => offeredByCode.has(code));
      if (!offeredCode) continue;
      const offeredName = normalizeCourseName(offeredByCode.get(offeredCode));
      const expected = [course.name, ...(course.formerNames ?? [])].map((name) => normalizeCourseName(name));
      assert.ok(
        expected.includes(offeredName),
        `${offeredCode} 요람 과목명(${course.name})과 개설과목명(${offeredByCode.get(offeredCode)})이 다릅니다`,
      );
    }
  }
});

test("accepts developer feedback one way and keeps it manageable", async () => {
  const { validateFeedback, feedbackCategories, FEEDBACK_MAX_LENGTH } = await import("../app/lib/feedback.mjs");

  assert.deepEqual(feedbackCategories.map((item) => item.key), ["bug", "curriculum", "idea", "etc"]);
  assert.deepEqual(validateFeedback({ category: "bug", message: "  개설과목이 빠졌어요  " }), {
    ok: true,
    category: "bug",
    message: "개설과목이 빠졌어요",
  });
  assert.equal(validateFeedback({ category: "nope", message: "충분히 긴 내용" }).ok, false, "정해진 분류만 받는다");
  assert.equal(validateFeedback({ category: "bug", message: "짧음" }).ok, false);
  assert.equal(validateFeedback({ category: "bug", message: "가".repeat(FEEDBACK_MAX_LENGTH + 1) }).ok, false);
  assert.equal(validateFeedback({ category: "bug" }).ok, false);

  const [feedbackRoute, chat, schema, adminFeedback, adminSession, adminLib] = await Promise.all([
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/FeedbackChat.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-session.mjs", import.meta.url), "utf8"),
  ]);

  // 단방향: 접수만 하고 답장 수단(이름·이메일·연락처)은 받지도 저장하지도 않는다
  assert.doesNotMatch(feedbackRoute, /\bexport async function GET\b/, "공개 API로는 건의를 읽을 수 없다");
  const feedbackTable = schema.slice(schema.indexOf("feedbackMessages"), schema.indexOf("userProfiles"));
  assert.doesNotMatch(feedbackTable, /email|contact|phone|reply/i, "답장 수단은 컬럼으로 두지 않는다");
  assert.doesNotMatch(chat, /type="email"|연락처를|이메일을/);
  assert.match(feedbackRoute, /FEEDBACK_DAILY_LIMIT/, "하루 접수 횟수를 제한한다");
  assert.match(feedbackRoute, /status: 429/);
  assert.match(schema, /feedbackMessages/);
  assert.match(schema, /status: text\("status"\)/);

  // 관리: 서명한 세션 쿠키가 있어야 읽기·상태 변경이 가능하다
  assert.match(adminFeedback, /verifyAdminSession/);
  assert.match(adminFeedback, /status: 401/);
  assert.match(adminFeedback, /export async function PATCH/);
  assert.match(adminSession, /safeEqual\(given, token\)/, "관리자 키는 상수 시간으로 비교한다");
  assert.match(adminLib, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(adminLib, /crypto\.subtle\.sign/, "쿠키에는 키가 아니라 서명값만 담는다");
  assert.doesNotMatch(adminSession, /searchParams|\?token=/, "키를 URL에 담지 않는다");
  assert.doesNotMatch(adminLib, /process\.env\.ADMIN_TOKEN/, "토큰은 호출부에서만 읽는다");
  assert.match(adminSession, /LOGIN_MAX_ATTEMPTS/, "로그인 시도 횟수를 제한한다");
  assert.match(adminSession, /status: 429/);
  assert.match(adminSession, /retry-after/);
  assert.doesNotMatch(adminLib, /x-forwarded-for[\s\S]{0,400}insert|원본 IP를 저장/, "원본 IP는 저장하지 않는다");
});

test("expires the admin session so a copied cookie stops working", async () => {
  const { createAdminSession, verifyAdminSession, loginBucket, SESSION_TTL_SECONDS } = await import(
    "../app/lib/admin-session.mjs"
  );

  const token = "test-admin-token-0123456789";
  const now = 1_800_000_000_000;
  const value = await createAdminSession(token, now);
  const asRequest = (cookie) => new Request("https://example.test/", { headers: { cookie } });
  const cookie = `coursecheck_admin=${value}`;

  assert.ok(await verifyAdminSession(asRequest(cookie), token, now), "발급 직후에는 유효하다");
  assert.ok(
    await verifyAdminSession(asRequest(cookie), token, now + SESSION_TTL_SECONDS * 1000 - 1000),
    "만료 직전에는 유효하다",
  );
  assert.equal(
    await verifyAdminSession(asRequest(cookie), token, now + SESSION_TTL_SECONDS * 1000 + 1),
    false,
    "만료 후 같은 쿠키 값은 통하지 않는다",
  );

  // 만료 시각만 미래로 바꿔치기하면 서명이 깨진다
  const [, signature] = value.split(".");
  const forged = `coursecheck_admin=${now + 10 ** 12}.${signature}`;
  assert.equal(await verifyAdminSession(asRequest(forged), token, now), false, "만료 시각 위조는 막힌다");

  assert.equal(await verifyAdminSession(asRequest(cookie), "other-admin-token-9876543", now), false);
  assert.equal(await verifyAdminSession(asRequest("coursecheck_admin=garbage"), token, now), false);
  assert.equal(await verifyAdminSession(asRequest(""), token, now), false);
  assert.equal(await verifyAdminSession(asRequest(cookie), undefined, now), false);

  // 세션 값에는 만료 시각과 서명만 들어가고 토큰은 들어가지 않는다
  assert.match(value, /^\d+\.[0-9a-f]{64}$/);
  assert.ok(!value.includes(token));

  // 시도 묶음 키는 IP를 그대로 담지 않는다
  const bucket = await loginBucket(new Request("https://example.test/", { headers: { "x-forwarded-for": "203.0.113.7" } }), token);
  assert.match(bucket, /^[0-9a-f]{32}$/);
  assert.ok(!bucket.includes("203"));
});

test("keeps analytics anonymous, PostgreSQL-backed, and Everytime requests allowlisted", async () => {
  const [events, everytime, schema, profile, profileSetup, stats, database] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/everytime/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ProfileSetup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stats/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(everytime, /\["everytime\.kr", "www\.everytime\.kr"\]/);
  assert.match(everytime, /TOKEN_PATTERN/);
  assert.match(everytime, /MAX_XML_SIZE/);
  assert.match(everytime, /MAX_SEMESTERS/);
  assert.match(everytime, /extractSemesterReferences/);
  assert.match(everytime, /\{ terms, courses:/);
  assert.match(everytime, /extractEverytimeUrl/);
  // 주석을 걷어낸 실제 컬럼 정의에 민감 항목이 없어야 한다
  const columns = schema.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  assert.doesNotMatch(columns, /"(?:[^"]*_)?(?:ip|user_agent|token|url|course_name)"/i);
  assert.doesNotMatch(events, /request\.headers\.get\("user-agent"\)|cf-connecting-ip/i);
  assert.match(profile, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(profile, /ALLOWED_MAJORS/);
  assert.match(profileSetup, /role="combobox"/);
  assert.match(profileSetup, /국어국문학과/);
  assert.match(profileSetup, /이수학기 수/);
  assert.match(profileSetup, /소속 대학/);
  assert.match(profile, /ALLOWED_COLLEGES/);
  assert.match(schema, /college: text\("college"\)/);
  assert.match(stats, /userProfiles/);
  assert.match(database, /@neondatabase\/serverless/);
  assert.match(database, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(database, /cloudflare:workers|drizzle-orm\/d1/);
});
