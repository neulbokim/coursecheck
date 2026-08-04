import { adminCookie, safeEqual, signAdminSession } from "../../../lib/admin-session.mjs";

const SESSION_MAX_AGE = 60 * 60 * 8;

function responseHeaders() {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff" } as Record<string, string>;
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
    const payload = (await request.json()) as { token?: unknown };
    const given = typeof payload.token === "string" ? payload.token : "";
    if (!safeEqual(given, token)) {
      return Response.json({ error: "관리자 키가 맞지 않아요." }, { status: 401, headers: responseHeaders() });
    }
    const headers = new Headers(responseHeaders());
    headers.set("set-cookie", adminCookie(await signAdminSession(token), SESSION_MAX_AGE));
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ error: "로그인하지 못했어요." }, { status: 400, headers: responseHeaders() });
  }
}

export async function DELETE() {
  const headers = new Headers(responseHeaders());
  headers.set("set-cookie", adminCookie("", 0));
  return Response.json({ ok: true }, { headers });
}
