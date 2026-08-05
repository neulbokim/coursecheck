import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { appendLocalLog } from "../../lib/local-event-log.mjs";

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
  "english_highlight",
  "feedback_open",
  "helpful_vote",
]);
/**
 * 이벤트마다 뜻이 다른 묶음 값입니다.
 * results_view는 결과 과목 수(0·1-25·26+), everytime_import는 가져온 과목 수(0·1-5·6+),
 * ge_mode는 고른 교양 표시(all·core·none), english_highlight는 강조를 켰는지(on·off),
 * helpful_vote는 도움이 됐는지(yes·no)를 담습니다.
 */
const ALLOWED_BUCKETS = new Set(["0", "1-5", "6+", "1-25", "26+", "all", "core", "none", "on", "off", "yes", "no"]);

const COOKIE_NAME = "coursecheck_visitor";
const VISITOR_ID_PATTERN = /^[0-9a-f-]{36}$/i;

function visitorIdFrom(request: Request) {
  const raw = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  return raw && VISITOR_ID_PATTERN.test(raw) ? raw : null;
}

export async function POST(request: Request) {
  /**
   * 데이터베이스에 넣는 것과 별개로, 개발 중에는 같은 한 줄을 내 컴퓨터의 파일에도 남깁니다.
   * 버려진 이벤트와 데이터베이스가 죽어서 못 넣은 이벤트까지 보이도록 갈림길마다 적습니다.
   * 배포에서는 local-event-log가 알아서 아무 일도 하지 않습니다.
   */
  const receivedAt = new Date().toISOString();
  const visitorId = visitorIdFrom(request);
  let name: string | null = null;
  const mirror = (fields: { bucket: string | null; stored: boolean; note?: string }) =>
    appendLocalLog("analytics-events.jsonl", { at: receivedAt, event: name, ...fields, hasVisitor: visitorId !== null });

  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 1024) {
      await mirror({ bucket: null, stored: false, note: "too_large" });
      return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    }
    const payload = (await request.json()) as { event?: string; resultBucket?: string };
    name = payload.event?.slice(0, 64) ?? null;
    if (!payload.event || !ALLOWED_EVENTS.has(payload.event)) {
      await mirror({ bucket: null, stored: false, note: "not_allowed" });
      return Response.json({ error: "허용되지 않은 이벤트입니다." }, { status: 400 });
    }
    const bucket = payload.resultBucket && ALLOWED_BUCKETS.has(payload.resultBucket) ? payload.resultBucket : null;

    /**
     * 누구인지는 브라우저 말이 아니라 서버가 정합니다. 방문자 쿠키는 HttpOnly라
     * 화면 코드가 읽지 못하고, 소속·전공·학번·이수학기·방문자 ID는 저장된 설정에서 직접 가져옵니다.
     * 선택 동의를 하지 않았거나 설정이 없으면 전부 NULL로 들어가 이름과 묶음 값만 남습니다.
     *
     * 설정을 한 번 읽고 넣는 일을 한 문장으로 처리해 왕복을 늘리지 않습니다.
     */
    await getDb().execute(sql`
      insert into analytics_events
        (event_name, result_bucket, college, major, cohort_year, completed_semesters, visitor_id)
      select ${payload.event}, ${bucket},
             case when p.analytics_consent then p.college end,
             case when p.analytics_consent then p.major_1 end,
             case when p.analytics_consent then p.cohort_year end,
             case when p.analytics_consent then p.completed_semesters end,
             case when p.analytics_consent then p.visitor_id end
      from (select 1) as always
      left join user_profiles p on p.visitor_id = ${visitorId}
    `);
    await mirror({ bucket, stored: true });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    await mirror({ bucket: null, stored: false, note: "server_error" });
    return Response.json({ error: "통계를 기록할 수 없습니다." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
