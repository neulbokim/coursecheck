import { count, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { analyticsEvents, userProfiles } from "../../../db/schema";

export async function GET() {
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
      { headers: { "cache-control": "public, max-age=60", "x-content-type-options": "nosniff" } },
    );
  } catch {
    return Response.json({ error: "아직 집계된 통계가 없습니다." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
