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
  assert.match(page, /전공 선택 확인/);
  assert.match(page, /이전 학기 시간표까지 모두/);
  assert.match(page, /추가로 제외할 과목/);
  assert.match(page, /개설 시간표 확인하기/);
  assert.doesNotMatch(page, /className="major-chip"/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|react-loading-skeleton|Your site is taking shape/);
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
  assert.doesNotMatch(schema, /ip|userAgent|token|url|courseName/i);
  assert.doesNotMatch(events, /request\.headers\.get\("user-agent"\)|cf-connecting-ip/i);
  assert.match(profile, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(profile, /ALLOWED_MAJORS/);
  assert.match(profileSetup, /role="combobox"/);
  assert.match(profileSetup, /국어국문학과/);
  assert.match(profileSetup, /이수학기 수/);
  assert.match(stats, /userProfiles/);
  assert.match(database, /@neondatabase\/serverless/);
  assert.match(database, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(database, /cloudflare:workers|drizzle-orm\/d1/);
});
