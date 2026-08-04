import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { feedbackMessages } from "../../../db/schema";
import { FEEDBACK_DAILY_LIMIT, validateFeedback } from "../../lib/feedback.mjs";

const COOKIE_NAME = "coursecheck_visitor";
const VISITOR_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const MAX_BODY_BYTES = 4096;

function responseHeaders() {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff" } as Record<string, string>;
}

function visitorIdFrom(request: Request) {
  const raw = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  return raw && VISITOR_ID_PATTERN.test(raw) ? raw : null;
}

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
      return Response.json({ error: "건의 내용이 너무 깁니다." }, { status: 413, headers: responseHeaders() });
    }
    const payload = (await request.json()) as { category?: unknown; message?: unknown };
    const checked = validateFeedback(payload);
    if (!checked.ok) {
      return Response.json({ error: checked.error }, { status: 400, headers: responseHeaders() });
    }

    const db = getDb();
    const visitorId = visitorIdFrom(request);
    if (visitorId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [recent] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(feedbackMessages)
        .where(and(eq(feedbackMessages.visitorId, visitorId), gte(feedbackMessages.createdAt, since)));
      if ((recent?.count ?? 0) >= FEEDBACK_DAILY_LIMIT) {
        return Response.json(
          { error: "오늘은 건의를 충분히 보내주셨어요. 내일 다시 이어서 보내주세요." },
          { status: 429, headers: responseHeaders() },
        );
      }
    }

    await db.insert(feedbackMessages).values({
      visitorId,
      category: checked.category,
      message: checked.message,
    });
    return Response.json({ ok: true }, { headers: responseHeaders() });
  } catch {
    return Response.json(
      { error: "건의를 보내지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: responseHeaders() },
    );
  }
}
