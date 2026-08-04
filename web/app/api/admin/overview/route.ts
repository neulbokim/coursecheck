import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
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
          major: analyticsEvents.major,
          cohortYear: analyticsEvents.cohortYear,
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

    // 어떤 정보를 고른 사람들이 쓰고 있는지 — 소속·전공·학번 분포와 단위별 이벤트.
    const [
      newUsers,
      byCollege,
      byCohort,
      byMajor,
      [visiting],
      [consented],
      eventsByCollege,
      eventsByMajor,
      eventsByCohort,
      reachByEvent,
      journeyRows,
    ] =
      await Promise.all([
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
        // 1·2·3전공을 한 줄로 펼쳐 전공별로 몇 명이 어느 순번으로 두고 있는지 셉니다
        db.execute(sql`
          select major,
                 count(*) filter (where rank = 1)::int as first,
                 count(*) filter (where rank = 2)::int as second,
                 count(*) filter (where rank = 3)::int as third,
                 count(*)::int as total
          from (
            select major_1 as major, 1 as rank from user_profiles
            union all select major_2, 2 from user_profiles where major_2 is not null
            union all select major_3, 3 from user_profiles where major_3 is not null
          ) as spread
          group by major
          order by count(*) desc, major
        `),
        db.select({ total: count() }).from(userProfiles).where(eq(userProfiles.enrolled, false)),
        db.select({ total: count() }).from(userProfiles).where(eq(userProfiles.analyticsConsent, true)),
        db
          .select({ key: analyticsEvents.college, event: analyticsEvents.eventName, total: count() })
          .from(analyticsEvents)
          .groupBy(analyticsEvents.college, analyticsEvents.eventName),
        db
          .select({ key: analyticsEvents.major, event: analyticsEvents.eventName, total: count() })
          .from(analyticsEvents)
          .groupBy(analyticsEvents.major, analyticsEvents.eventName),
        db
          .select({ key: analyticsEvents.cohortYear, event: analyticsEvents.eventName, total: count() })
          .from(analyticsEvents)
          .groupBy(analyticsEvents.cohortYear, analyticsEvents.eventName),
        // 이벤트별로 몇 사람이 거기까지 왔는지 (같은 사람이 여러 번 해도 한 번으로)
        db
          .select({ event: analyticsEvents.eventName, people: sql<number>`count(distinct ${analyticsEvents.visitorId})::int` })
          .from(analyticsEvents)
          .where(isNotNull(analyticsEvents.visitorId))
          .groupBy(analyticsEvents.eventName),
        /**
         * 사람마다 처음 한 순서대로 이벤트를 이어 붙여 같은 길을 걸은 사람을 셉니다.
         * 같은 이벤트를 여러 번 해도 첫 번째만 남겨 길이 읽히게 둡니다.
         */
        db.execute(sql`
          select path, count(*)::int as people
          from (
            select visitor_id, string_agg(event_name, '>' order by first_at) as path
            from (
              select visitor_id, event_name, min(created_at) as first_at
              from analytics_events
              where visitor_id is not null
              group by visitor_id, event_name
            ) as first_touch
            group by visitor_id
          ) as journeys
          group by path
          order by count(*) desc, path
          limit 10
        `),
      ]);

    return Response.json(
      {
        users: {
          total: users.total,
          last24h: newUsers[0].total,
          // 졸업생·외부인이 구경하려고 넣은 설정. 재학생 지표에서 빼고 보세요.
          visiting: visiting.total,
          // 소속·전공·학번을 이용 기록에 남겨도 된다고 한 사람. 아래 단위별 표는 이 사람들만 담습니다.
          consented: consented.total,
        },
        events: totals.map((row) => ({ ...row, last24h: recentByEvent.get(row.event) ?? 0 })),
        profiles: { byCollege, byCohort, byMajor: byMajor.rows ?? byMajor },
        // 관리 화면에서 소속·전공·학번으로 단위를 바꿔 봅니다
        eventsBy: {
          college: eventsByCollege,
          major: eventsByMajor,
          cohort: eventsByCohort.map((row) => ({ ...row, key: row.key === null ? null : String(row.key) })),
        },
        // 흐름 — 동의한 사람만 이어집니다
        flow: {
          reach: reachByEvent,
          journeys: ((journeyRows.rows ?? journeyRows) as Array<{ path: string; people: number }>).map((row) => ({
            steps: row.path.split(">"),
            people: row.people,
          })),
        },
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
