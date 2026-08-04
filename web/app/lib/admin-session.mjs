/**
 * 관리자 세션.
 *
 * 쿠키에는 `만료시각.서명` 만 담고, 서명은 `ADMIN_TOKEN`을 키로
 * `주제|만료시각`을 HMAC-SHA256 한 값입니다. 만료시각이 서명 안에 들어가므로
 * 쿠키 값을 복사해 두어도 만료 후에는 통하지 않습니다.
 */
export const ADMIN_COOKIE_NAME = "coursecheck_admin";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SESSION_SUBJECT = "coursecheck-admin-v2";

/** 로그인 시도 제한 기준 */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 60 * 10;
export const LOGIN_LOCK_SECONDS = 60 * 15;

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(token, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** 같은 길이 문자열을 상수 시간에 비교합니다. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/**
 * 만료시각을 서명에 포함한 세션 값을 만듭니다.
 * @param {string} token
 * @param {number} nowMs
 */
export async function createAdminSession(token, nowMs) {
  const expiresAt = nowMs + SESSION_TTL_SECONDS * 1000;
  return `${expiresAt}.${await hmacHex(token, `${SESSION_SUBJECT}|${expiresAt}`)}`;
}

function cookieValue(request) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.slice(ADMIN_COOKIE_NAME.length + 1);
}

/**
 * 요청 쿠키의 관리자 세션이 유효한지(서명·만료) 확인합니다.
 * @param {Request} request
 * @param {string | undefined} token
 * @param {number} [nowMs]
 */
export async function verifyAdminSession(request, token, nowMs = Date.now()) {
  if (!token) return false;
  const value = cookieValue(request);
  if (!value) return false;
  const separator = value.indexOf(".");
  if (separator <= 0) return false;
  const expiresAt = Number(value.slice(0, separator));
  const signature = value.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowMs) return false;
  return safeEqual(signature, await hmacHex(token, `${SESSION_SUBJECT}|${expiresAt}`));
}

/**
 * 로그인 시도 묶음 키. 원본 IP는 저장하지 않고 잘라낸 HMAC만 씁니다.
 * @param {Request} request
 * @param {string} token
 */
export async function loginBucket(request, token) {
  const forwarded = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "";
  const client = forwarded.split(",")[0].trim() || "unknown";
  return (await hmacHex(token, `login|${client}`)).slice(0, 32);
}

export function adminCookie(value, maxAge) {
  return `${ADMIN_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
