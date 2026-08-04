import { count } from "drizzle-orm";
import { getDb } from "../../../db";
import { userProfiles } from "../../../db/schema";

/**
 * 푸터에 쓰는 숫자 하나만 공개합니다. 이 값은 화면에 그대로 보이므로 감출 것이 없습니다.
 * 이벤트별 합계 등 나머지 운영 통계는 관리자 전용 `/api/stats`에 있습니다.
 */
export async function GET() {
  const headers = { "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" };
  try {
    const [users] = await getDb().select({ total: count() }).from(userProfiles);
    return Response.json({ total: users.total }, { headers });
  } catch {
    return Response.json({ error: "집계를 불러오지 못했어요." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
