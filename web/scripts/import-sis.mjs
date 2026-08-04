import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../data/2026-2-sis.xls");
const target = resolve(here, "../app/data/courses.generated.json");

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

const html = await readFile(source, "utf8");
const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
  [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
    decodeHtml(cell[1]),
  ),
);

const [headers, ...records] = rows;
const column = Object.fromEntries(headers.map((name, index) => [name, index]));
const take = (row, name) => row[column[name]] ?? "";

const courses = records
  .filter((row) => take(row, "과목번호") && take(row, "과목명"))
  .map((row) => ({
    id: `${take(row, "과목번호")}-${take(row, "분반")}`,
    year: Number(take(row, "학년도").replace(/\D/g, "")),
    term: take(row, "학기"),
    department: take(row, "학과"),
    code: take(row, "과목번호"),
    section: take(row, "분반"),
    name: take(row, "과목명"),
    credits: Number(take(row, "학점")) || 0,
    schedule: take(row, "수업시간/강의실"),
    professor: take(row, "교수진"),
    note: [take(row, "수강신청 참조사항"), take(row, "비고")]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500),
  }));

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(courses, null, 2)}\n`);
console.log(`Imported ${courses.length} courses from ${source}`);

