import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { courseDatasets } from "../../../db/schema";

/**
 * 관리 화면에서 올린 개설과목 자료 중 가장 최근 것을 돌려줍니다.
 * 올린 자료가 없으면 204를 주고, 화면은 빌드에 포함된 기본 자료를 그대로 씁니다.
 * 개설과목 정보는 이미 공개 자료이므로 로그인 없이 열어 둡니다.
 */
export async function GET() {
  try {
    const [latest] = await getDb()
      .select({
        semester: courseDatasets.semester,
        courseCount: courseDatasets.courseCount,
        uploadedAt: courseDatasets.uploadedAt,
        courses: courseDatasets.courses,
      })
      .from(courseDatasets)
      .orderBy(desc(courseDatasets.uploadedAt))
      .limit(1);

    if (!latest) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

    return Response.json(latest, {
      headers: { "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}
