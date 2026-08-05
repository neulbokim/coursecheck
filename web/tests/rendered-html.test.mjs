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

test("groups timetable entries by start time so one period is one row", () => {
  const entries = [
    { id: "a", meeting: { day: "월", start: 810, end: 885 } },   // 13:30~14:45
    { id: "b", meeting: { day: "월", start: 810, end: 975 } },   // 13:30~16:15 — 종료가 달라도 같은 행
    { id: "c", meeting: { day: "화", start: 810, end: 885 } },
    { id: "d", meeting: { day: "월", start: 900, end: 990 } },   // 15:00~16:30
  ];
  const slots = groupTimetableEntries(entries, ["월", "화"]);
  assert.equal(slots.length, 2, "시작 시각이 같으면 종료가 달라도 한 행이다");
  assert.equal(slots[0].start, 810);
  assert.equal(slots[0].end, 975, "행의 end는 그 행에서 가장 늦게 끝나는 시각");
  assert.deepEqual(slots[0].byDay["월"].map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(slots[0].byDay["화"].map((entry) => entry.id), ["c"]);
  assert.deepEqual(slots[1].byDay["월"].map((entry) => entry.id), ["d"]);
  assert.ok(slots[0].start < slots[1].start, "시작 시각 순으로 정렬된다");
});

test("parses SIS course files the same way for CLI and upload", async () => {
  const { parseSisCourses } = await import("../app/lib/sis-parse.mjs");

  const table = (rows) => `<html><body><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
  const headers = ["학년도", "학기", "소속", "학과", "과목번호", "분반", "과목명", "학점", "수업시간/강의실", "시간", "교수진", "수강신청 참조사항", "비고"];
  const row = (code, name) => ["2026 학년도", "2학기", "대학", "경영학부(경영학전공)", code, "01", name, "3.0", "월,수 12:00~13:15", "3.0", "김교수", "경영대학(가능)", "비고내용"];

  // 열이 없으면 무엇이 없는지 알려준다
  assert.throws(() => parseSisCourses(table([["학년도", "학기"], ["2026", "2학기"]])), /필요한 열이 없어요/);
  assert.throws(() => parseSisCourses("<html><body>표 없음</body></html>"), /표를 찾지 못했어요/);
  // 몇 줄뿐이면 전체 학기 파일이 아니라고 본다
  assert.throws(() => parseSisCourses(table([headers, row("MGT2001", "회계학원론")])), /전체 학기 파일/);

  const many = [headers, ...Array.from({ length: 60 }, (_, i) => row(`MGT${2000 + i}`, `과목${i}`))];
  const { courses, semester } = parseSisCourses(table(many));
  assert.equal(courses.length, 60);
  assert.equal(semester, "2026-2");
  assert.equal(courses[0].id, "MGT2000-01");
  assert.equal(courses[0].credits, 3);
  assert.equal(courses[0].department, "경영학부(경영학전공)");
  // 수강 자격 판정이 보는 필드에 수강신청 참조사항이 먼저 들어간다
  assert.match(courses[0].note, /^경영대학\(가능\)/);
  assert.match(courses[0].note, /비고내용/);

  // CLI 스크립트와 업로드 API가 같은 파서를 쓴다
  const [cli, upload] = await Promise.all([
    readFile(new URL("../scripts/import-sis.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/courses/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(cli, /parseSisCourses/);
  assert.match(upload, /parseSisCourses/);
  assert.match(upload, /verifyAdminSession/);
  assert.match(upload, /status: 401/);
  assert.match(upload, /MAX_UPLOAD_BYTES/);
});

test("filters courses the student cannot register for", async () => {
  const { affiliationsOf, checkEligibility, parseEligibility, collegeOfDepartment } = await import(
    "../app/data/affiliations.mjs"
  );

  assert.equal(collegeOfDepartment("경영학부(경영학전공)"), "경영대학");
  assert.equal(collegeOfDepartment("신문방송학과"), "지식융합미디어대학");
  assert.equal(collegeOfDepartment("아트&테크놀로지학과"), "지식융합미디어대학");
  assert.equal(collegeOfDepartment("게페르트국제학부"), "로욜라국제대학");
  assert.equal(collegeOfDepartment("글로벌융합학부"), "로욜라국제대학");
  assert.equal(collegeOfDepartment("유럽문화학과"), "인문대학");
  assert.equal(collegeOfDepartment("일본문화전공"), null, "학부에서 폐지되어 매핑하지 않는다");
  assert.equal(collegeOfDepartment("글로벌한국학부", 2024), "로욜라국제대학");
  assert.equal(collegeOfDepartment("글로벌한국학부", 2023), "지식융합미디어대학");

  assert.deepEqual(parseEligibility("컴퓨터공학과(불가능),인공지능학과(1전공 가능)"), [
    { name: "컴퓨터공학과", allow: false, firstMajorOnly: false },
    { name: "인공지능학과", allow: true, firstMajorOnly: true },
  ]);
  assert.deepEqual(parseEligibility("경제대학(가능) · (전학년수강신청일에 비경제전공자 수강신청 가능)"), [
    { name: "경제대학", allow: true, firstMajorOnly: false },
  ]);
  assert.deepEqual(parseEligibility(""), []);

  const student = (majors, college, cohortYear = 2022) => affiliationsOf({ cohortYear, majors }, college);

  const before = student([
    { name: "국어국문학과", rank: 1, approved: true },
    { name: "경영학부(경영학전공)", rank: 2, approved: false },
  ], "인문대학");
  assert.equal(checkEligibility("경영대학(가능)", before).eligible, false);
  assert.match(checkEligibility("경영대학(가능)", before).reason, /경영대학/);

  const after = student([
    { name: "국어국문학과", rank: 1, approved: true },
    { name: "경영학부(경영학전공)", rank: 2, approved: true },
  ], "인문대학");
  assert.equal(checkEligibility("경영대학(가능)", after).eligible, true);
  assert.equal(checkEligibility("지식융합미디어대학(가능)", after).eligible, false);

  const first = student([{ name: "경영학부(경영학전공)", rank: 1, approved: false }], "경영대학");
  assert.equal(checkEligibility("경영대학(가능)", first).eligible, true, "1전공은 항상 인정");

  assert.equal(checkEligibility("경영대학(1전공 가능)", after).eligible, false, "2전공자는 1전공 전용 과목 불가");
  assert.equal(checkEligibility("경영대학(1전공 가능)", first).eligible, true);

  const cse = student([
    { name: "컴퓨터공학과", rank: 1, approved: true },
    { name: "경영학부(경영학전공)", rank: 2, approved: true },
  ], "소프트웨어융합대학");
  const cseSecond = student([
    { name: "국어국문학과", rank: 1, approved: true },
    { name: "컴퓨터공학과", rank: 2, approved: true },
  ], "인문대학");
  assert.equal(checkEligibility("컴퓨터공학과(불가능)", cse).eligible, false);
  assert.equal(checkEligibility("컴퓨터공학과(불가능)", cseSecond).eligible, false, "2전공자도 막힌다");
  assert.equal(checkEligibility("컴퓨터공학과(1전공 불가능)", cse).eligible, false);
  assert.equal(checkEligibility("컴퓨터공학과(1전공 불가능)", cseSecond).eligible, true, "2전공자는 들을 수 있다");

  const linked = student([
    { name: "국어국문학과", rank: 1, approved: true },
    { name: "빅데이터사이언스 연계전공", rank: 2, approved: true },
  ], "인문대학");
  assert.equal(checkEligibility("빅데이터사이언스연계전공(가능)", linked).eligible, true, "표기의 공백 차이를 흡수");

  // 같은 조직의 옛 이름·변형을 하나로 본다 (커뮤니케이션대학 = 지식융합미디어대학)
  const media = student([
    { name: "국어국문학과", rank: 1, approved: true },
    { name: "신문방송학과", rank: 2, approved: true },
  ], "인문대학");
  assert.equal(checkEligibility("커뮤니케이션대학(가능)", media).eligible, true);
  assert.equal(checkEligibility("지식융합미디어학부(가능)", media).eligible, true);
  assert.equal(checkEligibility("지식융합대학(가능)", media).eligible, true);

  assert.equal(checkEligibility("", after).eligible, true);
  assert.equal(checkEligibility("전학년 수강 가능", after).eligible, true);
});

test("lays picked courses on a time-proportional calendar with lanes", async () => {
  const { assignLanes, layoutCalendar, hourMarks, SLOT_MINUTES } = await import("../app/lib/calendar-layout.mjs");
  const at = (day, start, end, id) => ({ id, meeting: { day, start, end } });

  assert.equal(SLOT_MINUTES, 10, "시작 시각은 15분 배수, 종료는 11:50·18:50뿐이라 10분 격자에 다 맞는다");

  // 겹치지 않으면 한 레인을 재사용한다
  const serial = assignLanes([at("월", 540, 615, "a"), at("월", 630, 705, "b")]);
  assert.equal(serial.lanes, 1);
  assert.deepEqual(serial.blocks.map((b) => b.lane), [0, 0]);
  assert.ok(serial.blocks.every((b) => !b.conflict));

  // 겹치면 레인을 나누고 양쪽 다 충돌로 표시한다
  const clash = assignLanes([at("월", 810, 885, "a"), at("월", 810, 975, "b"), at("월", 900, 975, "c")]);
  assert.equal(clash.lanes, 2);
  const laneOf = (id) => clash.blocks.find((b) => b.entry.id === id).lane;
  assert.notEqual(laneOf("a"), laneOf("b"));
  assert.equal(laneOf("c"), laneOf("a"), "a가 끝난 뒤라 a의 레인을 물려받는다");
  assert.equal(clash.blocks.find((b) => b.entry.id === "a").conflict, true);
  assert.equal(clash.blocks.find((b) => b.entry.id === "c").conflict, true, "b와 겹치므로 충돌");

  // 시간에 비례한 행 위치·길이
  const layout = layoutCalendar([at("화", 810, 885, "a"), at("수", 840, 890, "b")], ["월", "화", "수"]);
  assert.equal(layout.startMin, 9 * 60, "기본 범위는 09:00부터");
  const a = layout.byDay["화"].blocks[0];
  assert.equal(a.rowStart, (810 - 540) / 10 + 1, "13:30은 09:00에서 27칸 뒤");
  assert.equal(a.rowSpan, 8, "75분은 10분 격자에서 8칸");
  const b = layout.byDay["수"].blocks[0];
  assert.equal(b.rowStart, (840 - 540) / 10 + 1, "14:00은 13:30보다 3칸 아래 — 같은 높이가 아니다");
  assert.ok(b.rowStart > a.rowStart);
  assert.equal(layout.byDay["월"].blocks.length, 0);
  assert.equal(layout.byDay["월"].lanes, 1, "빈 요일도 열이 하나는 있다");

  // 늦게 끝나는 수업이 있으면 범위가 늘어난다
  const late = layoutCalendar([at("금", 1140, 1250, "a")], ["금"]);
  assert.equal(late.endMin, 1250, "20:50까지 격자에 정확히 맞는다");
  assert.equal(late.rows, (1250 - 540) / 10);

  assert.equal(layoutCalendar([at("월", 810, 885, "a"), at("월", 810, 885, "b")], ["월"]).conflictCount, 2);
  assert.deepEqual(hourMarks(540, 660).map((m) => m.time), [540, 600], "격자 밖 정시는 암시적 행을 만들므로 뺀다");
  assert.equal(hourMarks(540, 660)[1].row, 7, "10:00은 09:00에서 6칸 뒤");
  assert.ok(hourMarks(540, 1250).every((m) => m.row <= (1250 - 540) / 10));
});

test("excludes every course the bulletin groups as choose-one", async () => {
  const { expandEquivalents, equivalentGroups, equivalentLabel } = await import("../app/data/equivalents.mjs");
  const { normalizeCourseName } = await import("../app/lib/course-name.mjs");

  // 모든 묶음에 근거가 적혀 있어야 한다
  for (const group of equivalentGroups) {
    assert.ok(group.source.length > 20, `${group.key}에 근거가 없습니다`);
    assert.ok(group.codes.length >= 2, `${group.key}는 두 과목 이상이어야 합니다`);
  }

  const offerings = [
    { code: "MAT3020", name: "통계학입문" },
    { code: "MGT2002", name: "경영통계학" },
    { code: "ECO2004", name: "경제통계학" },
    { code: "SOC2004", name: "사회통계학(캡스톤디자인)" },
    { code: "CSE3080", name: "자료구조" },
  ];

  // 경영통계학만 들었어도 통계학 묶음 전체가 제외된다
  const byName = expandEquivalents([{ name: "경영통계학" }], offerings);
  assert.ok(byName.groups.has("statistics"));
  assert.ok(byName.names.has(normalizeCourseName("통계학입문")));
  assert.ok(byName.names.has(normalizeCourseName("경제통계학")));
  assert.ok(byName.names.has(normalizeCourseName("사회통계학(캡스톤디자인)")), "개설과목명 변형도 함께 잡는다");
  assert.ok(!byName.names.has(normalizeCourseName("자료구조")));
  assert.equal(equivalentLabel("statistics"), "통계학");

  // 코드로도 묶인다
  assert.ok(expandEquivalents([{ name: "아무이름", code: "ECO2004" }], offerings).groups.has("statistics"));

  // 미적분학Ⅰ을 들었으면 경제수리기초·대학수학까지
  const math = expandEquivalents([{ name: "미적분학I" }], offerings);
  assert.ok(math.names.has(normalizeCourseName("경제수리기초")));
  assert.ok(math.names.has(normalizeCourseName("대학수학")));

  // 묶음에 없는 과목만 들었으면 아무것도 넓히지 않는다
  const none = expandEquivalents([{ name: "자료구조" }], offerings);
  assert.equal(none.groups.size, 0);
  assert.equal(none.names.size, 0);
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
  // 문구는 자주 바뀌므로 구조만 확인한다
  assert.match(page, /className="hero"[\s\S]{0,500}<h1>[\s\S]{0,200}시간표/, "히어로에 제목이 있다");
  assert.match(page, /semesterLabel/, "학기 표시는 실제 자료에서 온다");
  assert.match(page, /전공 단위로 한 번에 제외/, "전공별 일괄 제외");
  assert.match(page, /GE_MODES/, "교양 표시 전환");
  assert.match(page, /내 시간표/, "담은 과목 캘린더 뷰");
  assert.match(page, /layoutCalendar/);
  assert.match(page, /PICKED_STORAGE_KEY/, "담은 과목은 브라우저에만 저장");
  assert.doesNotMatch(page, /picked.*fetch\(|fetch\([^)]*picked/i, "담은 과목을 서버로 보내지 않는다");
  assert.match(page, /이전 학기 시간표까지 모두/);
  assert.match(page, /추가로 제외할 과목/);
  assert.match(page, /필수 교양 이수 확인/);
  assert.match(page, /개설 시간표 확인하기/);
  // 건의하기 단추는 시간표 화면과 약관 화면이 함께 쓰는 컴포넌트에 있다
  assert.match(page, /<FeedbackLauncher/);
  const [launcherFile, privacyPage] = await Promise.all([
    readFile(new URL("../app/components/FeedbackLauncher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(launcherFile, /개발자에게 건의하기/);
  assert.match(privacyPage, /<FeedbackLauncher/, "약관 화면에서도 건의할 수 있어야 한다");
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
  assert.equal(courses.length, 1494);
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

  // 집계·로그 화면도 같은 세션으로만 열린다
  const adminOverview = await readFile(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8");
  assert.match(adminOverview, /verifyAdminSession/);
  assert.match(adminOverview, /status: 401/);
  assert.doesNotMatch(adminOverview, /message:/, "건의 본문은 집계 응답에 담지 않는다");
  // 흐름을 세려면 안쪽 질의에서 visitor_id로 묶어야 하지만, 밖으로 나가는 값은 집계뿐이어야 한다
  assert.doesNotMatch(
    adminOverview,
    /visitorId: analyticsEvents\.visitorId/,
    "방문자 ID를 응답 필드로 고르면 안 된다",
  );
  assert.match(adminOverview, /count\(distinct/, "몇 사람인지만 센다");
  assert.match(adminOverview, /select path, count\(\*\)::int as people/, "흐름은 길과 사람 수로만 나간다");
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(adminPage, /집계·로그/);
  assert.match(adminPage, /vercel logs/, "서버 예외 로그의 위치를 안내한다");
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
  const [events, everytime, schema, profile, profileSetup, stats, database, page] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/everytime/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ProfileSetup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stats/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  // 운영 통계는 관리자 전용이고, 공개되는 건 푸터용 숫자 하나뿐
  assert.match(stats, /verifyAdminSession/, "이벤트 합계는 관리자만 본다");
  assert.match(stats, /status: 401/);
  assert.doesNotMatch(page, /api\/user-count|api\/stats/, "본문은 통계를 전혀 가져오지 않는다");
  assert.doesNotMatch(page, /명이 설정을 완료했어요/, "사용자 수를 화면에 노출하지 않는다");
  assert.match(page, /checkEligibility/, "소속 제한으로 신청 못 하는 과목을 뺀다");
  assert.match(database, /@neondatabase\/serverless/);
  assert.match(database, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(database, /cloudflare:workers|drizzle-orm\/d1/);
});

test("records every event the page actually sends", async () => {
  const [events, page, admin, profileSetup, launcher, track] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ProfileSetup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/FeedbackLauncher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/track.mjs", import.meta.url), "utf8"),
  ]);
  // 이벤트를 쏘는 곳이 화면 하나가 아니므로 모두 모아서 본다
  const callers = [page, launcher].join("\n");

  const listOf = (source, name) => {
    const block = source.match(new RegExp(`${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
    assert.ok(block, `${name}을 찾지 못했다`);
    return new Set([...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  };
  const allowedEvents = listOf(events, "ALLOWED_EVENTS");
  const allowedBuckets = listOf(events, "ALLOWED_BUCKETS");

  // 화이트리스트에 없는 이름으로 쏘면 400으로 조용히 버려진다 — 양쪽이 어긋나면 집계에 구멍이 난다
  const sent = [...callers.matchAll(/postEvent\("([^"]+)"/g)].map((match) => match[1]);
  assert.ok(sent.length > 0, "화면이 이벤트를 하나도 쏘지 않는다");
  for (const event of sent) {
    assert.ok(allowedEvents.has(event), `${event}를 쏘는데 ALLOWED_EVENTS에 없다`);
    assert.match(admin, new RegExp(`\\["${event}",`), `${event}에 붙일 한글 이름이 /admin에 없다`);
  }
  for (const event of allowedEvents) {
    assert.ok(sent.includes(event), `${event}는 아무도 쏘지 않는다 — 목록에서 빼자`);
  }

  // 묶음 값도 마찬가지로 통과하지 못하면 null로 저장된다
  for (const bucket of ["0", "1-5", "6+", "1-25", "26+", "yes", "no"]) {
    assert.ok(allowedBuckets.has(bucket), `${bucket} 묶음이 ALLOWED_BUCKETS에 없다`);
  }

  // 누구인지는 브라우저 말이 아니라 서버가 정한다 — 화면은 이름과 묶음 값만 보낸다
  assert.match(events, /analytics_consent/, "동의 여부를 서버에서 확인해야 한다");
  assert.match(events, /HttpOnly 쿠키|coursecheck_visitor/);
  const eventBody = track.match(/body: JSON\.stringify\(\{ event[^}]*\}\)/)?.[0] ?? "";
  assert.ok(eventBody, "postEvent가 보내는 본문을 찾지 못했다");
  assert.doesNotMatch(eventBody, /college|major|cohort|consent/, "화면이 사용자 속성을 실어 보내면 안 된다");
  assert.doesNotMatch(callers, /fetch\("\/api\/events"/, "이벤트는 track.mjs 한 곳으로만 보낸다");
  assert.match(profileSetup, /analyticsConsent/);
  assert.match(profileSetup, /\(필수\)/, "설정 저장 동의는 필수로 받는다");
  assert.match(profileSetup, /\(선택\)/, "선택 동의는 필수 동의와 구분해 보여준다");
  // 동의를 받을 때 보유기간을 함께 알린다 (알리기만 하고 안 지우면 약속이 아니므로 크론도 함께 본다)
  assert.match(profileSetup, /1년이 지나면 파기|30일 뒤 파기/);
  const cleanup = await readFile(new URL("../app/api/cron/cleanup/route.ts", import.meta.url), "utf8");
  assert.match(cleanup, /CRON_SECRET/, "정리 경로는 크론만 부를 수 있어야 한다");
  assert.match(cleanup, /status: 401/);
  const vercelConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(vercelConfig.crons?.[0]?.path, "/api/cron/cleanup", "적어둔 보유기간을 실제로 도는 크론이 있어야 한다");
  assert.doesNotMatch(
    profileSetup,
    /checked=\{analyticsConsent \?\? true\}|useState\(initialProfile\?\.analyticsConsent \?\? true\)/,
    "선택 동의를 미리 체크해 두면 동의가 아니다",
  );
  // 이벤트 이름과 묶음 값은 허용 목록을 거친다 (임의 문자열이 들어오지 못하게)
  assert.match(events, /ALLOWED_EVENTS/);
  assert.match(events, /ALLOWED_BUCKETS/);
  assert.match(events, /VISITOR_ID_PATTERN/, "쿠키에서 온 방문자 ID도 형식을 확인한다");
  // 동의를 거두면 이미 쌓인 기록에서도 사람과 이어지는 값을 지운다
  const profileRoute = await readFile(new URL("../app/api/profile/route.ts", import.meta.url), "utf8");
  assert.match(profileRoute, /if \(!analyticsConsent\)/);
  assert.match(profileRoute, /visitorId: null/);
  // 로컬 사본에는 방문자 ID를 그대로 넘기지 않는다 (있었는지 여부만 넘긴다)
  const mirrored = events.match(/appendLocalLog\("analytics-events\.jsonl", \{[^}]*\}\)/)?.[0] ?? "";
  assert.ok(mirrored, "로컬 사본에 넘기는 값을 찾지 못했다");
  assert.match(mirrored, /hasVisitor: visitorId !== null/);
  assert.doesNotMatch(mirrored, /visitorId,|visitorId:\s*visitorId/, "방문자 ID를 파일에 적으면 안 된다");
});

test("writes down why an Everytime read failed, without the link or token", async () => {
  const [everytime, admin, adminPage, cleanup] = await Promise.all([
    readFile(new URL("../app/api/everytime/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cron/cleanup/route.ts", import.meta.url), "utf8"),
  ]);

  // 화면 문구를 다듬어도 집계가 끊기지 않게, 세는 값은 코드로 던진다
  const codes = [...everytime.matchAll(/new EverytimeFailure\("([a-z_]+)"/g)].map((match) => match[1]);
  assert.ok(codes.length >= 5, "실패마다 사유 코드를 붙여야 한다");
  for (const code of ["not_everytime_link", "bad_link", "not_public", "blocked", "too_big"]) {
    assert.ok(codes.includes(code), `${code} 코드를 던지는 곳이 없다`);
  }
  assert.match(everytime, /error\.name === "AbortError"\) return "timeout"/, "타임아웃도 코드로 세야 한다");
  assert.match(everytime, /return "unknown"/, "예상 못 한 오류도 묶어 세야 한다");

  // 요청 전체 실패와 학기별 실패를 모두 남긴다
  const recorded = [...everytime.matchAll(/await recordFailures\(/g)];
  assert.equal(recorded.length, 2, "요청 전체 실패와 학기별 실패를 모두 남겨야 한다");
  assert.match(everytime, /scope: "request", step, reasonCode, elapsedMs/);
  assert.match(everytime, /failures\.push\(\{ scope: "semester", reasonCode: failureCode\(error\), semester \}\)/);
  for (const step of ["link", "bootstrap", "first_table", "terms"]) {
    assert.match(everytime, new RegExp(`"${step}"`), `${step} 단계를 표시하지 않는다`);
  }

  // 배포에서도 세려면 표에 쌓아야 하고, 표에 못 넣어도 사용자 응답은 그대로여야 한다
  assert.match(everytime, /insert\(everytimeFailures\)/, "배포에서는 표에 쌓아야 한다");
  assert.match(everytime, /insert\(everytimeFailures\)[\s\S]{0,120}catch \{/, "표에 못 넣어도 응답을 깨지 말아야 한다");
  assert.match(cleanup, /delete\(everytimeFailures\)/, "적어둔 보유기간대로 실패 기록도 지워야 한다");

  // 예상 못 한 오류만 원본을 런타임 로그로 보낸다 — 그때도 링크·토큰은 넣지 않는다
  const runtimeLog = everytime.match(/console\.error\([\s\S]*?\}\);/)?.[0] ?? "";
  assert.ok(runtimeLog, "예상 못 한 오류의 원본을 남기지 않는다");
  assert.match(everytime, /if \(reasonCode === "unknown"\)/);
  assert.doesNotMatch(runtimeLog, /token|payload\.url|finalUrl|cookie/i);

  // 표에 넣는 값에도 링크·토큰·방문자 ID가 없다
  const recordSignature = everytime.match(/async function recordFailures\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(recordSignature, "recordFailures를 찾지 못했다");
  assert.doesNotMatch(recordSignature, /token|url|visitor|cookie/i, "링크·토큰·방문자 ID를 기록하면 안 된다");

  // 관리 화면에서 사유별로 볼 수 있어야 하고, 표가 아직 없어도 나머지 집계는 살아야 한다
  assert.match(admin, /from\(everytimeFailures\)/);
  assert.match(admin, /ready: false/, "표가 없을 때도 집계 전체가 503이 되면 안 된다");
  for (const code of codes) {
    assert.match(adminPage, new RegExp(`\\["${code}",`), `${code}에 붙일 한글 이름이 /admin에 없다`);
  }
  assert.match(adminPage, /\["timeout",/);
  assert.match(adminPage, /\["unknown",/);
});

test("pages the whole event log instead of cutting it off", async () => {
  const [events, overview, adminPage] = await Promise.all([
    readFile(new URL("../app/api/admin/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  ]);

  // 목록은 관리자만 보고, 쿼리를 돌리기 전에 막는다
  assert.match(events, /verifyAdminSession/);
  assert.match(events, /status: 401/);

  // 이어 보는 기준은 시각이 아니라 id — 같은 초에 여러 건이 들어오면 경계에서 줄이 겹치거나 빠진다
  assert.match(events, /lt\(analyticsEvents\.id, before\)/);
  assert.match(events, /orderBy\(desc\(analyticsEvents\.id\)\)/);
  assert.match(events, /\/\^\\d\{1,12\}\$\/\.test\(beforeRaw\)/, "커서는 숫자만 받아야 한다");
  assert.match(events, /Math\.min\(requested, MAX_PAGE_SIZE\)/, "한 쪽 크기에 상한이 있어야 한다");
  // 한 줄 더 받아 다음 쪽이 있는지 보고, 그 한 줄은 돌려주지 않는다
  assert.match(events, /limit\(limit \+ 1\)/);
  assert.match(events, /rows\.slice\(0, limit\), hasMore: rows\.length > limit/);

  // 집계에는 목록을 싣지 않는다 — 더 보기를 누를 때마다 무거운 집계를 다시 돌리면 안 된다
  assert.doesNotMatch(overview, /RECENT_LIMIT/);
  assert.doesNotMatch(overview, /recent,\n/);

  // 화면은 마지막 줄의 id로 다음 쪽을 물어 이어 붙인다
  assert.match(adminPage, /events\?before=\$\{last\.id\}/);
  assert.match(adminPage, /setLog\(\(current\) => \[\.\.\.current, \.\.\.\(data\.events \?\? \[\]\)\]\)/);
  assert.match(adminPage, /더 보기/);
});

test("splits the helpful-vote answers on the admin dashboard", async () => {
  const [admin, adminPage] = await Promise.all([
    readFile(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  ]);
  // 만족도는 이벤트 합계가 아니라 묶음 값(yes·no)에 있으므로 갈라 세야 보인다
  assert.match(admin, /eq\(analyticsEvents\.eventName, "helpful_vote"\)/);
  assert.match(admin, /groupBy\(analyticsEvents\.resultBucket\)/);
  assert.match(admin, /helpful: helpfulVotes\.map/);
  // 답 없는 옛 기록은 비율에서 뺀다 (안 그러면 만족도가 낮아 보인다)
  assert.match(adminPage, /const answered = yes \+ no/);
  assert.match(adminPage, /answered > 0 \? Math\.round\(\(yes \/ answered\) \* 100\)/);
  assert.match(adminPage, /도움이 됐나요 응답/, "대시보드에 응답 표가 있어야 한다");
});

test("mirrors events to a local file while writing nothing in production", async () => {
  const { appendLocalLog } = await import("../app/lib/local-event-log.mjs");
  const { mkdtemp, readFile: read, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const directory = await mkdtemp(join(tmpdir(), "coursecheck-local-log-"));
  const logDirectory = join(directory, "nested");
  const events = join(logDirectory, "analytics-events.jsonl");
  const failures = join(logDirectory, "everytime-failures.jsonl");
  const previousDirectory = process.env.LOCAL_LOG_DIR;
  const previousEnv = process.env.NODE_ENV;
  const previousCwd = process.cwd();
  try {
    // 개발 중에는 없는 폴더까지 만들어 파일별로 한 줄씩 덧붙인다
    process.env.LOCAL_LOG_DIR = logDirectory;
    await appendLocalLog("analytics-events.jsonl", { at: "2026-08-05T00:00:00.000Z", event: "everytime_import_error", stored: true });
    await appendLocalLog("analytics-events.jsonl", { at: "2026-08-05T00:00:01.000Z", event: "page_view", stored: false, note: "not_allowed" });
    await appendLocalLog("everytime-failures.jsonl", { at: "2026-08-05T00:00:02.000Z", scope: "semester", semester: "2025년 2학기", reason: "공유 시간표를 열 수 없어요." });
    const lines = (await read(events, "utf8")).trim().split("\n");
    assert.equal(lines.length, 2, "한 줄씩 덧붙여야 한다");
    assert.deepEqual(JSON.parse(lines[1]), {
      at: "2026-08-05T00:00:01.000Z",
      event: "page_view",
      stored: false,
      note: "not_allowed",
    });
    // 실패 사유는 이용 기록과 섞이지 않는다
    assert.deepEqual(JSON.parse((await read(failures, "utf8")).trim()), {
      at: "2026-08-05T00:00:02.000Z",
      scope: "semester",
      semester: "2025년 2학기",
      reason: "공유 시간표를 열 수 없어요.",
    });

    // off로 두면 개발 중에도 적지 않는다
    process.env.LOCAL_LOG_DIR = "off";
    await appendLocalLog("analytics-events.jsonl", { at: "2026-08-05T00:00:03.000Z", event: "page_view", stored: true });
    assert.equal((await read(events, "utf8")).trim().split("\n").length, 2);

    // 배포에서는 폴더를 지정하지 않으므로 기본 폴더조차 생기지 않는다 (빈 폴더에서 확인한다)
    process.chdir(directory);
    process.env.NODE_ENV = "production";
    delete process.env.LOCAL_LOG_DIR;
    await appendLocalLog("analytics-events.jsonl", { at: "2026-08-05T00:00:04.000Z", event: "page_view", stored: true });
    await assert.rejects(() => read(join(directory, ".local-logs", "analytics-events.jsonl"), "utf8"));

    // 폴더를 지정하지 않아도 개발 중에는 기본 폴더에 적는다
    process.env.NODE_ENV = "development";
    await appendLocalLog("analytics-events.jsonl", { at: "2026-08-05T00:00:05.000Z", event: "page_view", stored: true });
    assert.match(await read(join(directory, ".local-logs", "analytics-events.jsonl"), "utf8"), /00:00:05/);
    process.chdir(previousCwd);

    // 적을 수 없는 폴더여도 조용히 넘어간다 — 사본 때문에 응답이 깨지면 안 된다
    process.env.LOCAL_LOG_DIR = events;
    await appendLocalLog("analytics-events.jsonl", { at: "2026-08-05T00:00:06.000Z", event: "page_view", stored: true });
  } finally {
    process.chdir(previousCwd);
    if (previousDirectory === undefined) delete process.env.LOCAL_LOG_DIR;
    else process.env.LOCAL_LOG_DIR = previousDirectory;
    process.env.NODE_ENV = previousEnv;
    await rm(directory, { recursive: true, force: true });
  }
});
