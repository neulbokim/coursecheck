import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { analyticsEvents, feedbackMessages, userProfiles } from "../../../../db/schema";
import { verifyAdminSession } from "../../../lib/admin-session.mjs";

const RECENT_LIMIT = 120;
const OLD_EVENT_DAYS = 30;

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
          college: analyticsEvents.college,
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

    // 어떤 정보를 고른 사람들이 쓰고 있는지 — 소속·학번 분포와 소속별 이벤트.
    // 학과 단위로는 내려가지 않습니다(소수 인원이면 개인이 드러남).
    const [newUsers, byCollege, byCohort, [visiting], eventsByCollege] = await Promise.all([
      db.select({ total: count() }).from(userProfiles).where(and(gte(userProfiles.createdAt, since))),
      db
        .select({ college: userProfiles.college, total: count() })
        .from(userProfiles)
        .groupBy(userProfiles.college)
        .orderBy(desc(count())),
      db
        .select({ cohortYear: userProfiles.cohortYear, total: count() })
        .from(userProfiles)
        .groupBy(userProfiles.cohortYear)
        .orderBy(desc(userProfiles.cohortYear)),
      db.select({ total: count() }).from(userProfiles).where(eq(userProfiles.enrolled, false)),
      db
        .select({ college: analyticsEvents.college, event: analyticsEvents.eventName, total: count() })
        .from(analyticsEvents)
        .groupBy(analyticsEvents.college, analyticsEvents.eventName),
    ]);

    return Response.json(
      {
        users: {
          total: users.total,
          last24h: newUsers[0].total,
          // 졸업생·외부인이 구경하려고 넣은 설정. 재학생 지표에서 빼고 보세요.
          visiting: visiting.total,
        },
        events: totals.map((row) => ({ ...row, last24h: recentByEvent.get(row.event) ?? 0 })),
        profiles: { byCollege, byCohort },
        eventsByCollege,
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

/**
 * `?scope=all`이면 이벤트를 전부 지웁니다(공개 전 시험 기록 정리용, 되돌릴 수 없음).
 * 그 외에는 30일이 지난 것만 정리합니다.
 */
export async function DELETE(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || !(await verifyAdminSession(request, token))) {
    return Response.json({ error: "관리자 로그인이 필요해요." }, { status: 401, headers: responseHeaders() });
  }
  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "old";
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - OLD_EVENT_DAYS * 24 * 60 * 60 * 1000);
    const removed =
      scope === "all"
        ? await db.delete(analyticsEvents).returning({ id: analyticsEvents.id })
        : await db
            .delete(analyticsEvents)
            .where(sql`${analyticsEvents.createdAt} < ${cutoff.toISOString()}`)
            .returning({ id: analyticsEvents.id });
    return Response.json({ removed: removed.length, scope }, { headers: responseHeaders() });
  } catch {
    return Response.json({ error: "이벤트를 지우지 못했어요." }, { status: 503, headers: responseHeaders() });
  }
}
