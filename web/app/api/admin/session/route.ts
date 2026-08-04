import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminLoginAttempts } from "../../../../db/schema";
import {
  LOGIN_LOCK_SECONDS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_SECONDS,
  SESSION_TTL_SECONDS,
  adminCookie,
  createAdminSession,
  loginBucket,
  safeEqual,
} from "../../../lib/admin-session.mjs";

/** 실패 응답을 일부러 늦춰 자동 대입 속도를 떨어뜨립니다. */
const FAILURE_DELAY_MS = 350;

function responseHeaders() {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff" } as Record<string, string>;
}

function locked(retryAfterSeconds: number) {
  const headers = new Headers(responseHeaders());
  headers.set("retry-after", String(retryAfterSeconds));
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return Response.json(
    { error: `로그인 시도가 너무 많아요. ${minutes}분 후에 다시 시도해 주세요.` },
    { status: 429, headers },
  );
}

export async function POST(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return Response.json({ error: "ADMIN_TOKEN이 설정되지 않았어요." }, { status: 503, headers: responseHeaders() });
  }
  try {
    if (Number(request.headers.get("content-length") || 0) > 1024) {
      return Response.json({ error: "요청이 너무 큽니다." }, { status: 413, headers: responseHeaders() });
    }

    const db = getDb();
    const now = new Date();
    const clientHash = await loginBucket(request, token);
    const [record] = await db
      .select()
      .from(adminLoginAttempts)
      .where(eq(adminLoginAttempts.clientHash, clientHash))
      .limit(1);

    if (record?.lockedUntil && record.lockedUntil > now) {
      return locked(Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000));
    }

    const payload = (await request.json()) as { token?: unknown };
    const given = typeof payload.token === "string" ? payload.token : "";

    if (!safeEqual(given, token)) {
      const windowExpired =
        !record || now.getTime() - record.windowStartedAt.getTime() > LOGIN_WINDOW_SECONDS * 1000;
      const attempts = windowExpired ? 1 : record.attempts + 1;
      const lockedUntil =
        attempts >= LOGIN_MAX_ATTEMPTS ? new Date(now.getTime() + LOGIN_LOCK_SECONDS * 1000) : null;
      await db
        .insert(adminLoginAttempts)
        .values({
          clientHash,
          attempts,
          windowStartedAt: windowExpired ? now : record.windowStartedAt,
          lockedUntil,
        })
        .onConflictDoUpdate({
          target: adminLoginAttempts.clientHash,
          set: { attempts, windowStartedAt: windowExpired ? now : record.windowStartedAt, lockedUntil },
        });

      await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
      if (lockedUntil) return locked(LOGIN_LOCK_SECONDS);
      return Response.json(
        { error: `관리자 키가 맞지 않아요. ${LOGIN_MAX_ATTEMPTS - attempts}번 더 틀리면 잠깁니다.` },
        { status: 401, headers: responseHeaders() },
      );
    }

    await db.delete(adminLoginAttempts).where(eq(adminLoginAttempts.clientHash, clientHash));
    const headers = new Headers(responseHeaders());
    headers.set("set-cookie", adminCookie(await createAdminSession(token, now.getTime()), SESSION_TTL_SECONDS));
    return Response.json({ ok: true, expiresIn: SESSION_TTL_SECONDS }, { headers });
  } catch {
    return Response.json({ error: "로그인하지 못했어요." }, { status: 400, headers: responseHeaders() });
  }
}

export async function DELETE() {
  const headers = new Headers(responseHeaders());
  headers.set("set-cookie", adminCookie("", 0));
  return Response.json({ ok: true }, { headers });
}
