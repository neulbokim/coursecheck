import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { feedbackMessages, userProfiles } from "../../../../db/schema";
import { hasAdminSession } from "../../../lib/admin-session.mjs";
import { feedbackStatuses } from "../../../lib/feedback.mjs";

const PAGE_SIZE = 200;

function responseHeaders() {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff" } as Record<string, string>;
}

async function guard(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return Response.json({ error: "ADMIN_TOKEN이 설정되지 않았어요." }, { status: 503, headers: responseHeaders() });
  if (!(await hasAdminSession(request, token))) {
    return Response.json({ error: "관리자 로그인이 필요해요." }, { status: 401, headers: responseHeaders() });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    // 학번·소속은 익명 방문자 ID로 이어 붙인 참고 정보입니다. 답장 수단은 저장하지 않습니다.
    const rows = await getDb()
      .select({
        id: feedbackMessages.id,
        category: feedbackMessages.category,
        message: feedbackMessages.message,
        status: feedbackMessages.status,
        createdAt: feedbackMessages.createdAt,
        cohortYear: userProfiles.cohortYear,
        college: userProfiles.college,
      })
      .from(feedbackMessages)
      .leftJoin(userProfiles, eq(userProfiles.visitorId, feedbackMessages.visitorId))
      .orderBy(desc(feedbackMessages.createdAt))
      .limit(PAGE_SIZE);
    return Response.json({ messages: rows }, { headers: responseHeaders() });
  } catch {
    return Response.json({ error: "건의를 불러오지 못했어요." }, { status: 503, headers: responseHeaders() });
  }
}

export async function PATCH(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const payload = (await request.json()) as { id?: unknown; status?: unknown };
    const id = Number(payload.id);
    const status = typeof payload.status === "string" ? payload.status : "";
    if (!Number.isInteger(id) || id <= 0 || !feedbackStatuses.includes(status)) {
      return Response.json({ error: "처리 상태를 다시 선택해 주세요." }, { status: 400, headers: responseHeaders() });
    }
    await getDb().update(feedbackMessages).set({ status }).where(eq(feedbackMessages.id, id));
    return Response.json({ ok: true }, { headers: responseHeaders() });
  } catch {
    return Response.json({ error: "상태를 바꾸지 못했어요." }, { status: 503, headers: responseHeaders() });
  }
}
