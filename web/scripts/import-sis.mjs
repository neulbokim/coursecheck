import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSisCourses } from "../app/lib/sis-parse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../data", process.argv[2] ?? "2026-2-sis.xls");
const target = resolve(here, "../app/data/courses.generated.json");
const metaTarget = resolve(here, "../app/data/courses.generated.meta.json");

const { courses, semester } = parseSisCourses(await readFile(source, "utf8"));

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(courses, null, 2)}\n`);
// 화면 머리말의 "○월 ○일 기준"이 읽는 값. 자료를 언제 갈아끼웠는지 손으로 적지 않기 위해 여기서 남긴다.
const meta = { semester, courseCount: courses.length, generatedAt: new Date().toISOString() };
await writeFile(metaTarget, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`Imported ${courses.length} courses (${semester}) from ${source}`);
