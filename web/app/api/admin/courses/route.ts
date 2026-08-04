import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { courseDatasets } from "../../../../db/schema";
import { verifyAdminSession } from "../../../lib/admin-session.mjs";
import { parseSisCourses } from "../../../lib/sis-parse.mjs";

/** SIS 파일은 1MB 안쪽입니다 (2026-2가 약 700KB) */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function responseHeaders() {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff" } as Record<string, string>;
}

async function guard(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return Response.json({ error: "ADMIN_TOKEN이 설정되지 않았어요." }, { status: 503, headers: responseHeaders() });
  if (!(await verifyAdminSession(request, token))) {
    return Response.json({ error: "관리자 로그인이 필요해요." }, { status: 401, headers: responseHeaders() });
  }
  return null;
}

/** 올려둔 개설과목 자료 목록 (본문 제외) */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const rows = await getDb()
      .select({
        id: courseDatasets.id,
        semester: courseDatasets.semester,
        courseCount: courseDatasets.courseCount,
        uploadedAt: courseDatasets.uploadedAt,
      })
      .from(courseDatasets)
      .orderBy(desc(courseDatasets.uploadedAt))
      .limit(20);
    return Response.json({ datasets: rows }, { headers: responseHeaders() });
  } catch {
    return Response.json({ error: "목록을 불러오지 못했어요." }, { status: 503, headers: responseHeaders() });
  }
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length") || 0) > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "파일이 너무 큽니다 (4MB 이내)." }, { status: 413, headers: responseHeaders() });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "파일을 선택해 주세요." }, { status: 400, headers: responseHeaders() });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "파일이 너무 큽니다 (4MB 이내)." }, { status: 413, headers: responseHeaders() });
    }

    // SIS가 내려주는 .xls는 실제로 HTML 표라서 그대로 텍스트로 읽는다
    const { courses, semester } = parseSisCourses(await file.text());

    const [saved] = await getDb()
      .insert(courseDatasets)
      .values({ semester, courseCount: courses.length, courses })
      .returning({ id: courseDatasets.id, semester: courseDatasets.semester, courseCount: courseDatasets.courseCount });

    return Response.json({ ok: true, ...saved }, { headers: responseHeaders() });
  } catch (error) {
    // 파서가 던진 안내 문구는 그대로 보여준다 (필요한 열이 없어요 등)
    const message = error instanceof Error && error.message.length < 200
      ? error.message
      : "파일을 읽지 못했어요.";
    return Response.json({ error: message }, { status: 400, headers: responseHeaders() });
  }
}
