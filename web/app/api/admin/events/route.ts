import { count, desc, lt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { analyticsEvents } from "../../../../db/schema";
import { verifyAdminSession } from "../../../lib/admin-session.mjs";

/**
 * 최근 기록을 한 쪽씩 내려보냅니다.
 *
 * 집계(/api/admin/overview)에 목록까지 실어 보내면 「더 보기」를 누를 때마다 무거운
 * 집계 쿼리를 다시 돌게 되므로 목록만 여기서 답합니다. 한 번에 전부 내려보내지도
 * 않습니다 — 보유기간이 30일이라 쌓이면 한 응답에 담기 어려운 양이 됩니다.
 *
 * 이어 보는 기준은 시각이 아니라 id입니다. 같은 초에 여러 건이 들어오면 시각으로는
 * 경계에서 빠지거나 겹치는 줄이 생깁니다.
 */
const PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;

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

  const params = new URL(request.url).searchParams;
  const beforeRaw = params.get("before") ?? "";
  const before = /^\d{1,12}$/.test(beforeRaw) ? Number(beforeRaw) : null;
  const requested = Number(params.get("limit"));
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_PAGE_SIZE) : PAGE_SIZE;

  try {
    const db = getDb();
    // 한 줄 더 받아 보고 다음 쪽이 있는지 판단합니다 (따로 세지 않아도 됩니다)
    const [rows, [totals]] = await Promise.all([
      db
        .select({
          id: analyticsEvents.id,
          event: analyticsEvents.eventName,
          college: analyticsEvents.college,
          major: analyticsEvents.major,
          cohortYear: analyticsEvents.cohortYear,
          completedSemesters: analyticsEvents.completedSemesters,
          resultBucket: analyticsEvents.resultBucket,
          createdAt: analyticsEvents.createdAt,
        })
        .from(analyticsEvents)
        .where(before === null ? undefined : lt(analyticsEvents.id, before))
        .orderBy(desc(analyticsEvents.id))
        .limit(limit + 1),
      db.select({ total: count() }).from(analyticsEvents),
    ]);
    return Response.json(
      { events: rows.slice(0, limit), hasMore: rows.length > limit, total: totals.total },
      { headers: responseHeaders() },
    );
  } catch {
    return Response.json({ error: "기록을 불러오지 못했어요." }, { status: 503, headers: responseHeaders() });
  }
}
