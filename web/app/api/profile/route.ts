import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { userProfiles } from "../../../db/schema";
import { majorOptions } from "../../data/major-options";
import { LAST_BULLETIN_YEAR, colleges } from "../../data/core-curriculum.mjs";

const COOKIE_NAME = "coursecheck_visitor";
const VISITOR_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const ALLOWED_MAJORS = new Set(majorOptions);
const ALLOWED_COLLEGES = new Set<string>(colleges.map((college: { key: string }) => college.key));
const MIN_COHORT_YEAR = 2012;
const MAX_COHORT_YEAR = LAST_BULLETIN_YEAR;

type ProfileInput = {
  cohortYear?: unknown;
  completedSemesters?: unknown;
  college?: unknown;
  major1?: unknown;
  major2?: unknown;
  major3?: unknown;
};

function visitorIdFrom(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  return raw && VISITOR_ID_PATTERN.test(raw) ? raw : null;
}

function responseHeaders() {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff" };
}

export async function GET(request: Request) {
  try {
    const visitorId = visitorIdFrom(request);
    if (!visitorId) return Response.json({ profile: null }, { headers: responseHeaders() });
    const [profile] = await getDb()
      .select({
        cohortYear: userProfiles.cohortYear,
        completedSemesters: userProfiles.completedSemesters,
        college: userProfiles.college,
        major1: userProfiles.major1,
        major2: userProfiles.major2,
        major3: userProfiles.major3,
      })
      .from(userProfiles)
      .where(eq(userProfiles.visitorId, visitorId))
      .limit(1);
    return Response.json({ profile: profile ?? null }, { headers: responseHeaders() });
  } catch {
    return Response.json({ error: "저장된 설정을 불러오지 못했어요." }, { status: 503, headers: responseHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 2048) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413, headers: responseHeaders() });
    const payload = (await request.json()) as ProfileInput;
    const cohortYear = Number(payload.cohortYear);
    const completedSemesters = Number(payload.completedSemesters);
    const majors = [payload.major1, payload.major2, payload.major3].map((value) =>
      typeof value === "string" ? value.trim() : "",
    );
    const college = typeof payload.college === "string" && payload.college.trim() ? payload.college.trim() : null;

    if (!Number.isInteger(cohortYear) || cohortYear < MIN_COHORT_YEAR || cohortYear > MAX_COHORT_YEAR) {
      return Response.json({ error: "학번을 다시 선택해 주세요." }, { status: 400, headers: responseHeaders() });
    }
    if (!Number.isInteger(completedSemesters) || completedSemesters < 0 || completedSemesters > 16) {
      return Response.json({ error: "이수학기 수를 다시 선택해 주세요." }, { status: 400, headers: responseHeaders() });
    }
    if (!majors[0] || majors.some((major) => major && !ALLOWED_MAJORS.has(major))) {
      return Response.json({ error: "검색 결과에서 전공을 선택해 주세요." }, { status: 400, headers: responseHeaders() });
    }
    if (college && !ALLOWED_COLLEGES.has(college)) {
      return Response.json({ error: "소속 대학을 다시 선택해 주세요." }, { status: 400, headers: responseHeaders() });
    }
    if (new Set(majors.filter(Boolean)).size !== majors.filter(Boolean).length) {
      return Response.json({ error: "같은 전공을 중복해서 선택할 수 없어요." }, { status: 400, headers: responseHeaders() });
    }

    const visitorId = visitorIdFrom(request) ?? crypto.randomUUID();
    const values = {
      visitorId,
      cohortYear,
      completedSemesters,
      college,
      major1: majors[0],
      major2: majors[1] || null,
      major3: majors[2] || null,
      updatedAt: new Date(),
    };
    await getDb()
      .insert(userProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: userProfiles.visitorId,
        set: {
          cohortYear: values.cohortYear,
          completedSemesters: values.completedSemesters,
          college: values.college,
          major1: values.major1,
          major2: values.major2,
          major3: values.major3,
          updatedAt: values.updatedAt,
        },
      });

    const headers = new Headers(responseHeaders());
    headers.set(
      "set-cookie",
      `${COOKIE_NAME}=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    );
    return Response.json(
      { profile: { cohortYear, completedSemesters, college, major1: majors[0], major2: majors[1] || null, major3: majors[2] || null } },
      { headers },
    );
  } catch {
    return Response.json({ error: "설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503, headers: responseHeaders() });
  }
}
