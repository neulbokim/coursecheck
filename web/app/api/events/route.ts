import { getDb } from "../../../db";
import { analyticsEvents } from "../../../db/schema";
import { colleges } from "../../data/core-curriculum.mjs";

/**
 * 화면에서 실제로 쏘는 이벤트만 받습니다. 목록에 없으면 400으로 버리므로
 * 새 이벤트를 붙일 때는 여기와 /admin의 EVENT_LABEL을 함께 늘려야 합니다.
 */
const ALLOWED_EVENTS = new Set([
  "page_view",
  "profile_saved",
  "results_view",
  "everytime_import",
  "everytime_import_error",
  "course_pick",
  "ge_mode",
  "feedback_open",
  "helpful_vote",
]);
const ALLOWED_COLLEGES = new Set<string>(colleges.map((college: { key: string }) => college.key));
/**
 * 이벤트마다 뜻이 다른 묶음 값입니다.
 * results_view는 결과 과목 수(0·1-25·26+), everytime_import는 가져온 과목 수(0·1-5·6+),
 * ge_mode는 고른 교양 표시(all·core·none), helpful_vote는 도움이 됐는지(yes·no)를 담습니다.
 */
const ALLOWED_BUCKETS = new Set(["0", "1-5", "6+", "1-25", "26+", "all", "core", "none", "yes", "no"]);

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 1024) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    const payload = (await request.json()) as { event?: string; college?: string; resultBucket?: string };
    if (!payload.event || !ALLOWED_EVENTS.has(payload.event)) {
      return Response.json({ error: "허용되지 않은 이벤트입니다." }, { status: 400 });
    }
    await getDb().insert(analyticsEvents).values({
      eventName: payload.event,
      college: payload.college && ALLOWED_COLLEGES.has(payload.college) ? payload.college : null,
      resultBucket: payload.resultBucket && ALLOWED_BUCKETS.has(payload.resultBucket) ? payload.resultBucket : null,
    });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "통계를 기록할 수 없습니다." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
