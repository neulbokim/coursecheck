import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { analyticsEvents, everytimeFailures, feedbackMessages, userProfiles } from "../../../../db/schema";
import { verifyAdminSession } from "../../../lib/admin-session.mjs";

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
    const [totals, recentTotals, [users], feedbackByStatus] = await Promise.all([
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
      db.select({ total: count() }).from(userProfiles).where(eq(userProfiles.excluded, false)),
      db
        .select({ status: feedbackMessages.status, total: count() })
        .from(feedbackMessages)
        .groupBy(feedbackMessages.status),
    ]);

    /**
     * 「도움이 됐나요」 응답은 묶음 값(yes·no)에만 남으므로 이벤트 합계로는 만족도가 안 보입니다.
     * 여기서 갈라 세어 관리 화면에 만족도로 띄웁니다.
     */
    const helpfulVotes = await db
      .select({ bucket: analyticsEvents.resultBucket, total: count() })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.eventName, "helpful_vote"))
      .groupBy(analyticsEvents.resultBucket);

    /**
     * 에브리타임 실패는 사유 코드별로 셉니다. 마이그레이션을 아직 안 돌렸으면 표가 없으므로,
     * 그때는 이 칸만 비우고 나머지 집계는 그대로 보여줍니다(전체가 503이 되면 안 됩니다).
     */
    const failures = await (async () => {
      try {
        const [byReason, byStep, [recent]] = await Promise.all([
          db
            .select({ scope: everytimeFailures.scope, reasonCode: everytimeFailures.reasonCode, total: count() })
            .from(everytimeFailures)
            .groupBy(everytimeFailures.scope, everytimeFailures.reasonCode)
            .orderBy(desc(count())),
          db
            .select({ step: everytimeFailures.step, total: count() })
            .from(everytimeFailures)
            .where(eq(everytimeFailures.scope, "request"))
            .groupBy(everytimeFailures.step),
          db.select({ total: count() }).from(everytimeFailures).where(gte(everytimeFailures.createdAt, since)),
        ]);
        return { byReason, byStep, last24h: recent?.total ?? 0, ready: true };
      } catch {
        return { byReason: [], byStep: [], last24h: 0, ready: false };
      }
    })();

    const recentByEvent = new Map(recentTotals.map((row) => [row.event, row.total]));

    // 어떤 정보를 고른 사람들이 쓰고 있는지 — 소속·전공·학번 분포와 단위별 이벤트.
    const [
      newUsers,
      byCollege,
      byCohort,
      bySemesters,
      byMajor,
      [visiting],
      [consented],
      [excluded],
      eventsByCollege,
      eventsByMajor,
      eventsByCohort,
      eventsBySemesters,
      reachByEvent,
      journeyRows,
    ] =
      await Promise.all([
        db.select({ total: count() }).from(userProfiles).where(and(eq(userProfiles.excluded, false), gte(userProfiles.createdAt, since))),
        db
          .select({ college: userProfiles.college, total: count() })
          .from(userProfiles)
          .where(eq(userProfiles.excluded, false))
          .groupBy(userProfiles.college)
          .orderBy(desc(count())),
        db
          .select({ cohortYear: userProfiles.cohortYear, total: count() })
          .from(userProfiles)
          .where(eq(userProfiles.excluded, false))
          .groupBy(userProfiles.cohortYear)
          .orderBy(desc(userProfiles.cohortYear)),
        db
          .select({ semesters: userProfiles.completedSemesters, total: count() })
          .from(userProfiles)
          .where(eq(userProfiles.excluded, false))
          .groupBy(userProfiles.completedSemesters)
          .orderBy(userProfiles.completedSemesters),
        // 1·2·3전공을 한 줄로 펼쳐 전공별로 몇 명이 어느 순번으로 두고 있는지 셉니다
        db.execute(sql`
          select major,
                 count(*) filter (where rank = 1)::int as first,
                 count(*) filter (where rank = 2)::int as second,
                 count(*) filter (where rank = 3)::int as third,
                 count(*)::int as total
          from (
            select major_1 as major, 1 as rank from user_profiles where not excluded
            union all select major_2, 2 from user_profiles where major_2 is not null and not excluded
            union all select major_3, 3 from user_profiles where major_3 is not null and not excluded
          ) as spread
          group by major
          order by count(*) desc, major
        `),
        db.select({ total: count() }).from(userProfiles).where(and(eq(userProfiles.excluded, false), eq(userProfiles.enrolled, false))),
        db.select({ total: count() }).from(userProfiles).where(and(eq(userProfiles.excluded, false), eq(userProfiles.analyticsConsent, true))),
        // 만드는 사람이 관리자로 로그인한 채 눌러 본 설정. 위 분포에서는 이미 빠져 있고, 몇 개인지만 보여줍니다.
        db.select({ total: count() }).from(userProfiles).where(eq(userProfiles.excluded, true)),
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
        db
          .select({ key: analyticsEvents.completedSemesters, event: analyticsEvents.eventName, total: count() })
          .from(analyticsEvents)
          .groupBy(analyticsEvents.completedSemesters, analyticsEvents.eventName),
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
          // 관리자로 로그인한 채 저장한 내 설정. 위 숫자와 아래 분포에는 이미 들어 있지 않습니다.
          excluded: excluded.total,
        },
        events: totals.map((row) => ({ ...row, last24h: recentByEvent.get(row.event) ?? 0 })),
        profiles: { byCollege, byCohort, bySemesters, byMajor: byMajor.rows ?? byMajor },
        // 관리 화면에서 소속·전공·학번으로 단위를 바꿔 봅니다
        eventsBy: {
          college: eventsByCollege,
          major: eventsByMajor,
          cohort: eventsByCohort.map((row) => ({ ...row, key: row.key === null ? null : String(row.key) })),
          semesters: eventsBySemesters.map((row) => ({ ...row, key: row.key === null ? null : String(row.key) })),
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
        // 도움이 됐다·아쉬웠다 응답 수 (묶음 값이 비어 있는 옛 기록은 unknown으로 옵니다)
        helpful: helpfulVotes.map((row) => ({ vote: row.bucket ?? "unknown", total: row.total })),
        // 에브리타임 실패 — 사유 코드별·단계별. ready가 false면 표가 아직 없다는 뜻입니다.
        everytimeFailures: failures,
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
