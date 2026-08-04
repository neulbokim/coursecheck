import { and, count, desc, gte, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { analyticsEvents, feedbackMessages, userProfiles } from "../../../../db/schema";
import { verifyAdminSession } from "../../../lib/admin-session.mjs";

const RECENT_LIMIT = 120;

function responseHeaders() {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff" } as Record<string, string>;
}

export async function GET(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return Response.json({ error: "ADMIN_TOKEN이 설정되지 않았어요." }, { status: 503, headers: responseHeaders() });
  }
  if (!(await verifyAdminSession(request, token))) {
    return Response.json({ error: "관리자 로그인이 필요해요." }, { status: 401, headers: responseHeaders() });
  }

  try {
    const db = getDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 이벤트 이름별 전체 합계와 최근 24시간 합계
    const [totals, recentTotals, [users], recent, feedbackByStatus] = await Promise.all([
      db
        .select({ event: analyticsEvents.eventName, total: count() })
        .from(analyticsEvents)
        .groupBy(analyticsEvents.eventName)
        .orderBy(desc(count())),
      db
        .select({ event: analyticsEvents.eventName, total: count() })
        .from(analyticsEvents)
        .where(gte(analyticsEvents.createdAt, since))
        .groupBy(analyticsEvents.eventName),
      db.select({ total: count() }).from(userProfiles),
      db
        .select({
          id: analyticsEvents.id,
          event: analyticsEvents.eventName,
          majorKey: analyticsEvents.majorKey,
          resultBucket: analyticsEvents.resultBucket,
          createdAt: analyticsEvents.createdAt,
        })
        .from(analyticsEvents)
        .orderBy(desc(analyticsEvents.createdAt))
        .limit(RECENT_LIMIT),
      db
        .select({ status: feedbackMessages.status, total: count() })
        .from(feedbackMessages)
        .groupBy(feedbackMessages.status),
    ]);

    const recentByEvent = new Map(recentTotals.map((row) => [row.event, row.total]));
    const [newUsers] = await db
      .select({ total: count() })
      .from(userProfiles)
      .where(and(gte(userProfiles.createdAt, since)));

    return Response.json(
      {
        users: { total: users.total, last24h: newUsers.total },
        events: totals.map((row) => ({ ...row, last24h: recentByEvent.get(row.event) ?? 0 })),
        feedback: feedbackByStatus,
        recent,
        // 서버 예외·요청 로그는 앱이 아니라 Vercel 함수 로그에 남습니다.
        runtimeLogHint: "vercel logs",
      },
      { headers: responseHeaders() },
    );
  } catch {
    return Response.json({ error: "집계를 불러오지 못했어요." }, { status: 503, headers: responseHeaders() });
  }
}

export async function DELETE(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || !(await verifyAdminSession(request, token))) {
    return Response.json({ error: "관리자 로그인이 필요해요." }, { status: 401, headers: responseHeaders() });
  }
  try {
    // 30일보다 오래된 이벤트만 지웁니다 (합계 보존이 아니라 정리 목적)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const removed = await getDb()
      .delete(analyticsEvents)
      .where(sql`${analyticsEvents.createdAt} < ${cutoff.toISOString()}`)
      .returning({ id: analyticsEvents.id });
    return Response.json({ removed: removed.length }, { headers: responseHeaders() });
  } catch {
    return Response.json({ error: "오래된 이벤트를 지우지 못했어요." }, { status: 503, headers: responseHeaders() });
  }
}
