// SIS 개설교과목정보(zcmw9016)에서 이번 학기 전체 시간표를 내려받는다.
//   node scripts/fetch-sis.mjs            → data/{학년도}-{학기}-sis.xls 저장 후 import-sis.mjs까지 실행
//   node scripts/fetch-sis.mjs --no-import → 다운로드만
// WebDynpro는 세션 상태에 묶인 POST로만 파일을 주므로 curl 대신 헤드리스 브라우저로 화면 흐름을 재현한다.
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseSisCourses } from "../app/lib/sis-parse.mjs";

const SIS_URL = "https://sis109.sogang.ac.kr/sap/bc/webdynpro/sap/zcmw9016?sap-language=KO";
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../data");

// "2학기" → 2, "여름학기" → summer … 기존 data/ 파일명 규칙을 따른다.
function termToken(termLabel) {
  if (termLabel.includes("여름") || termLabel.includes("하계")) return "summer";
  if (termLabel.includes("겨울") || termLabel.includes("동계")) return "winter";
  const num = termLabel.match(/\d+/)?.[0];
  if (!num) throw new Error(`학기 표기를 읽지 못했어요: "${termLabel}"`);
  return num;
}

// WebDynpro 콤보박스: 입력은 readonly이고 {id}-btn 클릭 → aria-controls가 가리키는 리스트에서 항목 클릭.
async function pickComboOption(page, combo, optionText) {
  const id = await combo.getAttribute("id");
  const listId = await combo.getAttribute("aria-controls");
  await page.click(`[id="${id}-btn"]`);
  const option = page
    .locator(`[id="${listId}"] .lsListbox__value`)
    .filter({ hasText: new RegExp(`^${optionText}$`) })
    .first();
  await option.click({ timeout: 10_000 });
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(SIS_URL, { waitUntil: "domcontentloaded" });

  const combos = page.locator('input[ct="CB"]');
  await combos.nth(2).waitFor(); // 학년도·학기·소속구분 첫 칸까지 뜨면 화면 준비 완료
  const yearLabel = await combos.nth(0).inputValue(); // "2026 학년도"
  const termLabel = await combos.nth(1).inputValue(); // "2학기"
  const year = yearLabel.match(/\d{4}/)?.[0];
  if (!year) throw new Error(`학년도 표기를 읽지 못했어요: "${yearLabel}"`);
  const fileName = `${year}-${termToken(termLabel)}-sis.xls`;
  const outPath = resolve(dataDir, fileName);

  // 소속구분: 대학 — 서버 왕복 후 학과 콤보 두 개가 "- 전체 -"로 채워진다.
  await pickComboOption(page, combos.nth(2), "대학");
  await page.waitForFunction(
    () => document.querySelectorAll('input[ct="CB"]').length >= 5,
    undefined,
    { timeout: 30_000 },
  );

  await page.locator('[ct="B"]', { hasText: "검색" }).first().click();
  // 전체 학기 조회는 오래 걸린다 — 결과가 다 실려야 다운로드 단추가 생긴다.
  const downloadButton = page.locator('[ct="B"]', { hasText: "다운로드" });
  await downloadButton.waitFor({ timeout: 180_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    downloadButton.click(),
  ]);
  await download.saveAs(outPath);

  const { size } = await stat(outPath);
  // 계절학기는 정규학기보다 훨씬 작을 수 있으므로 용량 대신 표와 과목을 검증한다.
  const { courses } = parseSisCourses(await readFile(outPath, "utf8"));
  if (courses.some((course) => course.year !== Number(year) || termToken(course.term) !== termToken(termLabel))) {
    throw new Error(`조회한 학기(${yearLabel} ${termLabel})와 다운로드한 과목의 학기가 달라요`);
  }
  console.log(`Downloaded ${fileName} (${Math.round(size / 1024)}KB, ${yearLabel} ${termLabel})`);

  if (!process.argv.includes("--no-import")) {
    const result = spawnSync(process.execPath, [resolve(here, "import-sis.mjs"), basename(outPath)], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  await browser.close();
}
