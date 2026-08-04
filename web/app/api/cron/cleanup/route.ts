import { lt, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { analyticsEvents, feedbackMessages, userProfiles } from "../../../../db/schema";

/**
 * 적어둔 보유기간을 실제로 지키는 청소기. Vercel 크론이 하루 한 번 부릅니다(vercel.json).
 * 약관에 "언제 지운다"를 적어두고 지우지 않으면 그건 약속이 아니라서, 문구와 이 파일을
 * 같이 고쳐야 합니다.
 */
const EVENT_DAYS = 30;
const PROFILE_DAYS = 365;
const FEEDBACK_DAYS = 365;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Vercel 크론은 CRON_SECRET을 Bearer로 실어 보냅니다. 값이 없으면 아무나 부를 수 있으므로 닫습니다.
 * 설정이 없는 것과 값이 틀린 것을 나눠 답합니다 — 둘 다 401이면 왜 안 도는지 알 수 없어서,
 * 관리 API가 ADMIN_TOKEN에 쓰는 방식과 같게 뒀습니다.
 */
function checkAuth(request: Request): "ok" | "unset" | "mismatch" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "unset";
  return request.headers.get("authorization") === `Bearer ${secret}` ? "ok" : "mismatch";
}

export async function GET(request: Request) {
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  const auth = checkAuth(request);
  if (auth === "unset") {
    return Response.json({ error: "CRON_SECRET이 설정되지 않아 정리가 돌지 않습니다." }, { status: 503, headers });
  }
  if (auth === "mismatch") {
    return Response.json({ error: "크론 전용입니다." }, { status: 401, headers });
  }
  try {
    const db = getDb();
    const [events, profiles, feedback] = await Promise.all([
      db.delete(analyticsEvents).where(lt(analyticsEvents.createdAt, daysAgo(EVENT_DAYS))).returning({ id: analyticsEvents.id }),
      // 마지막으로 설정을 만진 지 1년이 지난 사람. 쿠키도 만료돼 어차피 찾아 쓸 수 없습니다.
      db.delete(userProfiles).where(lt(userProfiles.updatedAt, daysAgo(PROFILE_DAYS))).returning({ visitorId: userProfiles.visitorId }),
      db.delete(feedbackMessages).where(lt(feedbackMessages.createdAt, daysAgo(FEEDBACK_DAYS))).returning({ id: feedbackMessages.id }),
    ]);
    // 지워진 사람의 지난 이벤트에 남은 연결 고리도 끊습니다
    await db
      .update(analyticsEvents)
      .set({ visitorId: null, college: null, major: null, cohortYear: null })
      .where(sql`${analyticsEvents.visitorId} is not null and ${analyticsEvents.visitorId} not in (select visitor_id from user_profiles)`);

    return Response.json(
      { removed: { events: events.length, profiles: profiles.length, feedback: feedback.length } },
      { headers },
    );
  } catch {
    return Response.json({ error: "정리하지 못했어요." }, { status: 503, headers });
  }
}
