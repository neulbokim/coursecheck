import { count, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { analyticsEvents, userProfiles } from "../../../db/schema";
import { verifyAdminSession } from "../../lib/admin-session.mjs";

/**
 * 운영 통계는 관리자만 봅니다. 푸터에 쓰는 사용자 수만 `/api/user-count`로 공개합니다.
 * 이벤트 이름별 합계는 사용 패턴이 드러나므로 공개하지 않습니다.
 */
export async function GET(request: Request) {
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return Response.json({ error: "ADMIN_TOKEN이 설정되지 않았어요." }, { status: 503, headers });
  }
  if (!(await verifyAdminSession(request, token))) {
    return Response.json({ error: "관리자 로그인이 필요해요." }, { status: 401, headers });
  }
  try {
    const db = getDb();
    const rows = await db
      .select({ event: analyticsEvents.eventName, total: count() })
      .from(analyticsEvents)
      .groupBy(analyticsEvents.eventName)
      .orderBy(desc(count()));
    const [users] = await db.select({ total: count() }).from(userProfiles);
    return Response.json(
      { users: { total: users.total }, events: rows, privacy: "개인을 식별할 수 없는 합계만 제공됩니다." },
      { headers },
    );
  } catch {
    return Response.json({ error: "아직 집계된 통계가 없습니다." }, { status: 503, headers });
  }
}
