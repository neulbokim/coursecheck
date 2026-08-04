import { getDb } from "../../../db";
import { analyticsEvents } from "../../../db/schema";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "major_filter",
  "department_filter",
  "everytime_import",
  "everytime_import_error",
]);
const ALLOWED_MAJORS = new Set(["BDS", "PUB", "EDU", "SPM"]);
const ALLOWED_BUCKETS = new Set(["0", "1-5", "6+"]);

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 1024) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    const payload = (await request.json()) as { event?: string; majorKey?: string; resultBucket?: string };
    if (!payload.event || !ALLOWED_EVENTS.has(payload.event)) {
      return Response.json({ error: "허용되지 않은 이벤트입니다." }, { status: 400 });
    }
    await getDb().insert(analyticsEvents).values({
      eventName: payload.event,
      majorKey: payload.majorKey && ALLOWED_MAJORS.has(payload.majorKey) ? payload.majorKey : null,
      resultBucket: payload.resultBucket && ALLOWED_BUCKETS.has(payload.resultBucket) ? payload.resultBucket : null,
    });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "통계를 기록할 수 없습니다." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

