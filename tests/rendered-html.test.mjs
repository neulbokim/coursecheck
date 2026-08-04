import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|react-loading-skeleton|Your site is taking shape/);
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

test("keeps analytics anonymous and Everytime requests allowlisted", async () => {
  const [events, everytime, schema] = await Promise.all([
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/everytime/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(everytime, /\["everytime\.kr", "www\.everytime\.kr"\]/);
  assert.match(everytime, /TOKEN_PATTERN/);
  assert.match(everytime, /MAX_HTML_SIZE/);
  assert.doesNotMatch(schema, /ip|userAgent|token|url|courseName/i);
  assert.doesNotMatch(events, /request\.headers\.get\("user-agent"\)|cf-connecting-ip/i);
});
