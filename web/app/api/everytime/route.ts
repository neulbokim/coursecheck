import { extractEverytimeUrl } from "../../lib/everytime-link.mjs";
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

function getToken(input: string) {
  const url = new URL(extractEverytimeUrl(input));
  if (url.protocol !== "https:" || !EVERYTIME_HOSTS.includes(url.hostname)) {
    throw new Error("에브리타임의 HTTPS 공유 링크만 사용할 수 있어요.");
  }
  const match = url.pathname.match(/(?:\/app)?\/@([^/]+)\/?$/);
  if (!match || !TOKEN_PATTERN.test(match[1])) throw new Error("올바른 시간표 공유 링크가 아니에요.");
  return match[1];
}

function validateXml(xml: string) {
  if (xml.length > MAX_XML_SIZE) throw new Error("공유 시간표 응답이 너무 큽니다.");
  if (!xml.trim().startsWith("<?xml") || !xml.includes("<response>")) {
    throw new Error("에브리타임이 자동 확인을 잠시 제한했어요. 잠시 후 다시 시도해 주세요.");
  }
}

async function fetchFriendTable(
  identifier: string,
  friendInfo: boolean,
  cookie: string,
  userAgent: string,
  signal: AbortSignal,
) {
  if (!TOKEN_PATTERN.test(identifier)) throw new Error("올바르지 않은 학기 식별자입니다.");
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
  if (!response.ok) throw new Error("공유 시간표를 열 수 없어요. 링크 공개 상태를 확인해 주세요.");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_XML_SIZE) throw new Error("공유 시간표 응답이 너무 큽니다.");
  const xml = await response.text();
  validateXml(xml);
  return xml;
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
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, references.length) }, async () => {
    while (nextIndex < references.length) {
      const index = nextIndex++;
      const reference = references[index];
      try {
        const xml = reference.identifier === initialIdentifier
          ? initialXml
          : await fetchFriendTable(reference.identifier, false, cookie, userAgent, signal);
        const table = extractCurrentTable(xml);
        results[index] = {
          semester: `${reference.year}년 ${reference.semester}학기`,
          courses: extractCourses(xml),
          available: table?.status !== "-2",
        };
      } catch (error) {
        if (signal.aborted) throw error;
        results[index] = {
          semester: `${reference.year}년 ${reference.semester}학기`,
          courses: [],
          available: false,
        };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const requestSize = Number(request.headers.get("content-length") || 0);
    if (requestSize > 2048) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    const payload = (await request.json()) as { url?: string };
    const token = getToken(payload.url?.trim() || "");
    const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    const bootstrap = await fetch(`https://everytime.kr/@${token}`, {
      headers: { "user-agent": userAgent },
      redirect: "follow",
      signal: controller.signal,
    });
    const finalUrl = new URL(bootstrap.url);
    if (!bootstrap.ok || !EVERYTIME_HOSTS.includes(finalUrl.hostname)) {
      throw new Error("공유 시간표를 열 수 없어요. 링크 공개 상태를 확인해 주세요.");
    }
    const rawCookie = bootstrap.headers.get("set-cookie") || "";
    const cookie = rawCookie
      .split(/,(?=[^;,]+=)/)
      .map((value) => value.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    const initialXml = await fetchFriendTable(token, true, cookie, userAgent, controller.signal);
    const currentTable = extractCurrentTable(initialXml);
    const discovered = extractSemesterReferences(initialXml)
      .filter((reference) => TOKEN_PATTERN.test(reference.identifier))
      .slice(0, MAX_SEMESTERS);
    const references = discovered.length > 0
      ? discovered
      : [{
          identifier: currentTable?.identifier || token,
          year: currentTable?.year || "",
          semester: currentTable?.semester || "",
        }];
    const terms = await fetchAllTerms(
      references,
      initialXml,
      currentTable?.identifier || token,
      cookie,
      userAgent,
      controller.signal,
    );
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
    const message = error instanceof Error && error.name !== "AbortError"
      ? error.message
      : "공유 시간표 응답이 늦어요. 잠시 후 다시 시도해 주세요.";
    return Response.json({ error: message }, { status: 400, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  } finally {
    clearTimeout(timeout);
  }
}
