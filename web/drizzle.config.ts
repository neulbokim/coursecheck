import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit은 .env.local을 읽지 않습니다.
 *
 * 그대로 두면 DATABASE_URL이 없는 것으로 보고 아래 placeholder(localhost)로 붙으려 하는데,
 * 이 프로젝트는 Neon에 웹소켓으로 붙기 때문에 `npm run db:migrate`가 오류도 없이
 * "applying migrations…"에서 멈춰 있습니다. 무엇이 잘못됐는지 알 수 없어서 여기서 직접 읽습니다.
 *
 * 셸에 DATABASE_URL이 이미 있으면 그것을 먼저 씁니다(CI나 `vercel env`로 넘길 때).
 */
function fromEnvLocal(name: string) {
  try {
    const line = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
      .split("\n")
      .map((row) => row.trim())
      .filter((row) => !row.startsWith("#"))
      .find((row) => row.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") || undefined;
  } catch {
    // .env.local이 없는 곳(배포 빌드)에서는 셸 환경 변수만 씁니다.
    return undefined;
  }
}

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      fromEnvLocal("DATABASE_URL") ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
