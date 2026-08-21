import { getDb } from "../../../db";
import { everytimeFailures } from "../../../db/schema";
import { extractEverytimeUrl } from "../../lib/everytime-link.mjs";
import { isAdminBrowser, shouldStoreAnalytics } from "../../lib/analytics-sink.mjs";
import { appendLocalLog } from "../../lib/local-event-log.mjs";
import {
  extractCourses,
  extractCurrentTable,
  extractSemesterReferences,
} from "../../lib/everytime-timetable.mjs";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_XML_SIZE = 1_000_000;
const MAX_SEMESTERS = 24;
const FETCH_CONCURRENCY = 4;
const EVERYTIME_HOSTS = ["everytime.kr", "www.everytime.kr"];
/** 개발 중에는 같은 실패를 파일에도 남겨 바로 눈으로 봅니다. */
const FAILURE_LOG = "everytime-failures.jsonl";

/**
 * 화면에 나가는 문장과 세어 볼 사유를 따로 둡니다.
 *
 * 문장은 사람이 읽을 말이라 언제든 다듬게 되고 그때마다 집계가 끊기면 안 되니 코드를
 * 함께 던집니다. 관리 화면은 이 코드로만 세고, 예상 못 한 오류는 unknown으로 묶어
 * 원본은 런타임 로그에만 남깁니다.
 */
class EverytimeFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EverytimeFailure";
  }
}

function failureCode(error: unknown) {
  if (error instanceof EverytimeFailure) return error.code;
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "unknown";
}

function getToken(input: string) {
  let url: URL;
  try {
    // 링크로 읽을 수 없는 글이 들어오면 URL 파서의 영어 문구가 화면에 나가지 않게 여기서 바꿉니다.
    url = new URL(extractEverytimeUrl(input));
  } catch {
    throw new EverytimeFailure("bad_link", "올바른 시간표 공유 링크가 아니에요.");
  }
  if (url.protocol !== "https:" || !EVERYTIME_HOSTS.includes(url.hostname)) {
    throw new EverytimeFailure("not_everytime_link", "에브리타임의 HTTPS 공유 링크만 사용할 수 있어요.");
  }
  const match = url.pathname.match(/(?:\/app)?\/@([^/]+)\/?$/);
  if (!match || !TOKEN_PATTERN.test(match[1])) {
    throw new EverytimeFailure("bad_link", "올바른 시간표 공유 링크가 아니에요.");
  }
  return match[1];
}

function validateXml(xml: string) {
  if (xml.length > MAX_XML_SIZE) throw new EverytimeFailure("too_big", "공유 시간표 응답이 너무 큽니다.");
  if (!xml.trim().startsWith("<?xml") || !xml.includes("<response>")) {
    throw new EverytimeFailure("blocked", "에브리타임이 자동 확인을 잠시 제한했어요. 잠시 후 다시 시도해 주세요.");
  }
}

async function fetchFriendTable(
  identifier: string,
  friendInfo: boolean,
  cookie: string,
  userAgent: string,
  signal: AbortSignal,
) {
  if (!TOKEN_PATTERN.test(identifier)) {
    throw new EverytimeFailure("bad_identifier", "올바르지 않은 학기 식별자입니다.");
  }
  const response = await fetch("https://api.everytime.kr/find/timetable/table/friend", {
    method: "POST",
    headers: {
      accept: "application/xml, text/xml, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      cookie,
      origin: "https://everytime.kr",
      referer: "https://everytime.kr/",
      "user-agent": userAgent,
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams({ identifier, friendInfo: String(friendInfo) }),
    signal,
  });
  if (!response.ok) {
    throw new EverytimeFailure("not_public", "공유 시간표를 열 수 없어요. 링크 공개 상태를 확인해 주세요.");
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_XML_SIZE) throw new EverytimeFailure("too_big", "공유 시간표 응답이 너무 큽니다.");
  const xml = await response.text();
  validateXml(xml);
  return xml;
}

/**
 * 실패를 어디에 남길지 한 곳에서 정합니다.
 *
 * 배포에서도 세어 볼 수 있게 표에 쌓고, 개발 중에는 파일에도 남깁니다. 표에 넣다가
 * 실패해도 삼킵니다 — 기록을 못 남긴 것 때문에 사용자 응답까지 깨지면 안 되고,
 * 마이그레이션을 아직 안 돌렸을 때도 앱은 그대로 돌아야 합니다.
 */
async function recordFailures(
  request: Request,
  rows: Array<{
    scope: "request" | "semester";
    step?: string;
    reasonCode: string;
    semester?: string;
    elapsedMs?: number;
  }>,
) {
  if (rows.length === 0) return;
  await Promise.all([
    (async () => {
      // 개발 서버와 관리자 브라우저는 넣지 않습니다 (analytics-sink.mjs). 사본은 그대로 남습니다.
      if (!shouldStoreAnalytics() || (await isAdminBrowser(request))) return;
      try {
        await getDb().insert(everytimeFailures).values(rows);
      } catch {
        // 표에 못 넣어도 화면은 그대로 답합니다.
      }
    })(),
    ...rows.map((row) => appendLocalLog(FAILURE_LOG, { at: new Date().toISOString(), ...row })),
  ]);
}

/** 에타 학기 표기(1·여름·2·겨울)를 최신 학기가 크게 나오는 숫자로 */
const TERM_ORDER: Record<string, number> = { "1": 1, "여름": 2, "2": 3, "겨울": 4 };

function referenceRecency(reference: { year: string; semester: string }) {
  return Number(reference.year) * 10 + (TERM_ORDER[reference.semester] ?? 0);
}

async function fetchAllTerms(
  references: Array<{ identifier: string; year: string; semester: string }>,
  initialXml: string,
  initialIdentifier: string,
  cookie: string,
  userAgent: string,
  signal: AbortSignal,
) {
  const results = new Array(references.length);
  /** 학기별 실패는 모아 두고 한 번에 넣습니다 — 학기 수만큼 왕복하지 않게. */
  const failures: Array<{ scope: "semester"; reasonCode: string; semester: string }> = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, references.length) }, async () => {
    while (nextIndex < references.length) {
      const index = nextIndex++;
      const reference = references[index];
      const semester = `${reference.year}년 ${reference.semester}학기`;
      try {
        const xml = reference.identifier === initialIdentifier
          ? initialXml
          : await fetchFriendTable(reference.identifier, false, cookie, userAgent, signal);
        const table = extractCurrentTable(xml);
        const available = table?.status !== "-2";
        results[index] = {
          semester,
          courses: extractCourses(xml),
          available,
          // 사유 코드는 화면 문구와 분리해 둡니다 — 문구는 클라이언트가 코드를 보고 고릅니다
          ...(available ? {} : { reason: "not_public" }),
        };
        if (!available) failures.push({ scope: "semester", reasonCode: "not_public", semester });
      } catch (error) {
        if (signal.aborted) throw error;
        /**
         * 학기 하나가 안 열려도 나머지는 그대로 보여줍니다. 사유 코드를 응답에도 실어
         * 사용자가 학기 탭에서 왜 안 됐는지(비공개·제한 등) 볼 수 있게 합니다.
         */
        const reasonCode = failureCode(error);
        failures.push({ scope: "semester", reasonCode, semester });
        results[index] = { semester, courses: [], available: false, reason: reasonCode };
      }
    }
  });
  await Promise.all(workers);
  return { terms: results, failures };
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const startedAt = Date.now();
  /** 어디까지 갔다가 실패했는지 사유와 함께 남기려고 단계를 들고 다닙니다. */
  let step = "link";
  try {
    const requestSize = Number(request.headers.get("content-length") || 0);
    if (requestSize > 2048) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    const payload = (await request.json()) as { url?: string };
    const token = getToken(payload.url?.trim() || "");
    const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    step = "bootstrap";
    const bootstrap = await fetch(`https://everytime.kr/@${token}`, {
      headers: { "user-agent": userAgent },
      redirect: "follow",
      signal: controller.signal,
    });
    const finalUrl = new URL(bootstrap.url);
    if (!bootstrap.ok || !EVERYTIME_HOSTS.includes(finalUrl.hostname)) {
      throw new EverytimeFailure("not_public", "공유 시간표를 열 수 없어요. 링크 공개 상태를 확인해 주세요.");
    }
    const rawCookie = bootstrap.headers.get("set-cookie") || "";
    const cookie = rawCookie
      .split(/,(?=[^;,]+=)/)
      .map((value) => value.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    step = "first_table";
    const initialXml = await fetchFriendTable(token, true, cookie, userAgent, controller.signal);
    const currentTable = extractCurrentTable(initialXml);
    const rawReferences = extractSemesterReferences(initialXml);
    /**
     * 식별자가 이상한 학기는 조용히 버리지 않습니다 — 그러면 탭 자체가 사라져 사용자는
     * 그 학기가 있었는지도 모릅니다. 「가져오지 못한 학기」로 남기고 사유를 셉니다.
     */
    const unsupported = rawReferences
      .filter((reference) => !TOKEN_PATTERN.test(reference.identifier))
      .map((reference) => ({
        semester: `${reference.year}년 ${reference.semester}학기`,
        courses: [],
        available: false,
        reason: "bad_identifier",
      }));
    // 최신 학기부터 남긴다 — 상한에 걸려 잘려도 옛 학기부터 빠지게
    const discovered = rawReferences
      .filter((reference) => TOKEN_PATTERN.test(reference.identifier))
      .sort((a, b) => referenceRecency(b) - referenceRecency(a))
      .slice(0, MAX_SEMESTERS);
    /**
     * 공유 링크가 가리키는 시간표 본체는 대표 시간표 목록에 없을 수 있습니다(한 학기에 여러 표를
     * 두고 대표가 아닌 표를 공유한 경우). 그 학기의 대표 표 대신 **사용자가 공유한 표**를 씁니다 —
     * 대표 표는 비공개일 수 있고, 사용자가 보여주려던 것도 공유한 그 표입니다.
     */
    const shared = currentTable?.identifier && TOKEN_PATTERN.test(currentTable.identifier)
      ? { identifier: currentTable.identifier, year: currentTable.year, semester: currentTable.semester }
      : null;
    let references = discovered;
    if (shared && !references.some((reference) => reference.identifier === shared.identifier)) {
      const sameTerm = (reference: { year: string; semester: string }) =>
        reference.year === shared.year && reference.semester === shared.semester;
      references = references.some(sameTerm)
        ? references.map((reference) => (sameTerm(reference) ? shared : reference))
        : [shared, ...references];
    }
    if (references.length === 0) {
      references = [{
        identifier: currentTable?.identifier || token,
        year: currentTable?.year || "",
        semester: currentTable?.semester || "",
      }];
    }
    step = "terms";
    const { terms, failures } = await fetchAllTerms(
      references,
      initialXml,
      currentTable?.identifier || token,
      cookie,
      userAgent,
      controller.signal,
    );
    terms.push(...unsupported);
    await recordFailures(request, [
      ...failures,
      ...unsupported.map((term) => ({ scope: "semester" as const, reasonCode: "bad_identifier", semester: term.semester })),
    ]);
    const first = terms[0] ?? { courses: [], semester: "" };
    return Response.json(
      { terms, courses: first.courses, semester: first.semester },
      {
        headers: {
          "cache-control": "no-store, private",
          "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    const reasonCode = failureCode(error);
    const message = error instanceof EverytimeFailure
      ? error.message
      : "공유 시간표 응답이 늦어요. 잠시 후 다시 시도해 주세요.";
    /**
     * 예상 못 한 오류만 원본을 런타임 로그에 남깁니다(`vercel logs`). 표에는 코드만 들어가
     * 세기 좋고, 공유 링크와 토큰은 어느 쪽에도 적지 않습니다.
     */
    if (reasonCode === "unknown") {
      const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
      console.error("[everytime] 예상 못 한 실패", {
        step,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        cause: cause?.code,
      });
    }
    await recordFailures(request, [{ scope: "request", step, reasonCode, elapsedMs: Date.now() - startedAt }]);
    return Response.json({ error: message }, { status: 400, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  } finally {
    clearTimeout(timeout);
  }
}
