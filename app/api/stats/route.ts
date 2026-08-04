import { count, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { analyticsEvents } from "../../../db/schema";

export async function GET() {
  try {
    const rows = await getDb()
      .select({ event: analyticsEvents.eventName, total: count() })
      .from(analyticsEvents)
      .groupBy(analyticsEvents.eventName)
      .orderBy(desc(count()));
    return Response.json(
      { events: rows, privacy: "익명 집계만 제공됩니다." },
      { headers: { "cache-control": "public, max-age=60", "x-content-type-options": "nosniff" } },
    );
  } catch {
    return Response.json({ error: "아직 집계된 통계가 없습니다." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

