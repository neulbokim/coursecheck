const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_HTML_SIZE = 1_000_000;

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function getToken(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !["everytime.kr", "www.everytime.kr"].includes(url.hostname)) {
    throw new Error("에브리타임의 HTTPS 공유 링크만 사용할 수 있어요.");
  }
  const match = url.pathname.match(/(?:\/app)?\/@([^/]+)\/?$/);
  if (!match || !TOKEN_PATTERN.test(match[1])) throw new Error("올바른 시간표 공유 링크가 아니에요.");
  return match[1];
}

function attribute(xml: string, tag: string, name = "value") {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${name}=["']([^"']*)["']`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function extractCourses(xml: string) {
  const courses: Array<{ name: string; professor: string; room: string }> = [];
  const seen = new Set<string>();
  const subjectPattern = /<subject\b[^>]*>([\s\S]*?)<\/subject>/gi;
  for (const subject of xml.matchAll(subjectPattern)) {
    const name = attribute(subject[1], "name").slice(0, 160);
    const key = name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    if (!name || seen.has(key)) continue;
    const professor = attribute(subject[1], "professor").slice(0, 80);
    const timeRoom = subject[1].match(/<data\b[^>]*\splace=["']([^"']*)["']/i);
    const room = (timeRoom ? decodeHtml(timeRoom[1]) : attribute(subject[1], "place")).slice(0, 80);
    seen.add(key);
    courses.push({ name, professor, room });
  }
  return courses.slice(0, 80);
}

export async function POST(request: Request) {
  try {
    const requestSize = Number(request.headers.get("content-length") || 0);
    if (requestSize > 2048) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    const payload = (await request.json()) as { url?: string };
    const token = getToken(payload.url?.trim() || "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    const bootstrap = await fetch(`https://everytime.kr/@${token}`, {
      headers: { "user-agent": userAgent },
      redirect: "follow",
      signal: controller.signal,
    });
    const finalUrl = new URL(bootstrap.url);
    if (!bootstrap.ok || !["everytime.kr", "www.everytime.kr"].includes(finalUrl.hostname)) {
      throw new Error("공유 시간표를 열 수 없어요. 링크 공개 상태를 확인해 주세요.");
    }
    const rawCookie = bootstrap.headers.get("set-cookie") || "";
    const cookie = rawCookie
      .split(/,(?=[^;,]+=)/)
      .map((value) => value.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
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
      body: new URLSearchParams({ identifier: token, friendInfo: "true" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error("공유 시간표를 열 수 없어요. 링크 공개 상태를 확인해 주세요.");
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_HTML_SIZE) throw new Error("공유 시간표 응답이 너무 큽니다.");
    const xml = await response.text();
    if (xml.length > MAX_HTML_SIZE) throw new Error("공유 시간표 응답이 너무 큽니다.");
    if (!xml.trim().startsWith("<?xml") || !xml.includes("<response>")) {
      throw new Error("에브리타임이 자동 확인을 잠시 제한했어요. 잠시 후 다시 시도해 주세요.");
    }
    const table = xml.match(/<table\b([^>]*)>/i);
    const year = table ? attribute(`<table ${table[1]}>`, "table", "year") : "";
    const semester = table ? attribute(`<table ${table[1]}>`, "table", "semester") : "";
    return Response.json(
      { courses: extractCourses(xml), semester: year && semester ? `${year}년 ${semester}학기` : "" },
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
    const message = error instanceof Error && error.name !== "AbortError" ? error.message : "공유 시간표 응답이 늦어요. 잠시 후 다시 시도해 주세요.";
    return Response.json({ error: message }, { status: 400, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
}
