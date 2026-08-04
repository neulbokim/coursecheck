import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSisCourses } from "../app/lib/sis-parse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../data", process.argv[2] ?? "2026-2-sis.xls");
const target = resolve(here, "../app/data/courses.generated.json");

const { courses, semester } = parseSisCourses(await readFile(source, "utf8"));

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(courses, null, 2)}\n`);
console.log(`Imported ${courses.length} courses (${semester}) from ${source}`);
