#!/usr/bin/env node
/**
 * 배포 전 점검. `vercel --prod`는 로컬 폴더를 그대로 올리기 때문에,
 * 작업 트리가 지저분하거나 커밋을 안 올렸으면 "배포된 코드 = 어느 커밋"이 깨집니다.
 * 그 상태를 먼저 막고, 통과하면 배포에 새길 커밋을 알려줍니다.
 *
 *   npm run deploy:check     점검만
 *   npm run deploy           점검 후 vercel --prod
 */
import { execFileSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const problems = [];
let head = "";
let branch = "";

try {
  head = git("rev-parse", "--short", "HEAD");
  branch = git("rev-parse", "--abbrev-ref", "HEAD");
} catch {
  console.error("✗ git 저장소가 아니라 배포에 새길 커밋을 알 수 없어요.");
  process.exit(1);
}

// 1. 커밋하지 않은 변경이 있으면 올라간 코드와 커밋 해시가 어긋난다
const dirty = git("status", "--porcelain");
if (dirty) {
  const files = dirty.split("\n").slice(0, 5).map((line) => `    ${line}`).join("\n");
  const more = dirty.split("\n").length > 5 ? `\n    … 외 ${dirty.split("\n").length - 5}개` : "";
  problems.push(`커밋하지 않은 변경이 있어요. 이대로 올리면 배포에 새겨질 ${head}와 실제 코드가 달라집니다.\n${files}${more}`);
}

// 2. 원격에 없는 커밋을 배포하면 나중에 그 코드를 되찾을 수 없다
try {
  git("rev-parse", "--verify", `origin/${branch}`);
  const unpushed = git("rev-list", `origin/${branch}..HEAD`);
  if (unpushed) {
    const count = unpushed.split("\n").length;
    problems.push(`origin/${branch}에 올리지 않은 커밋이 ${count}개 있어요. 먼저 \`git push origin ${branch}\`.`);
  }
} catch {
  problems.push(`origin/${branch}이 없어요. 먼저 \`git push -u origin ${branch}\`.`);
}

// 3. 스키마를 고쳤으면 마이그레이션도 함께 있어야 한다
try {
  const changed = git("diff", "--name-only", "HEAD~1", "HEAD");
  const touchedSchema = changed.split("\n").some((file) => file.endsWith("db/schema.ts"));
  const touchedMigration = changed.split("\n").some((file) => file.includes("drizzle/") && file.endsWith(".sql"));
  if (touchedSchema && !touchedMigration) {
    problems.push("db/schema.ts를 고쳤는데 마이그레이션 파일이 없어요. `npm run db:generate` 후 커밋하세요.");
  }
} catch {
  // 커밋이 하나뿐이면 비교할 이전 커밋이 없다 — 넘어간다
}

if (problems.length > 0) {
  console.error("배포를 멈췄어요.\n");
  for (const problem of problems) console.error(`  ✗ ${problem}\n`);
  process.exit(1);
}

const tag = (() => {
  try {
    return git("describe", "--tags", "--abbrev=0");
  } catch {
    return "(없음)";
  }
})();

console.log(`✓ 배포해도 됩니다.
    브랜치   ${branch}
    커밋     ${head} — ${git("log", "-1", "--pretty=%s")}
    최근 태그 ${tag}

  배포 후 확인: curl -s https://<배포 URL>/api/health`);
