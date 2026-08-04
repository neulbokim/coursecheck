/**
 * 관리자 세션. `ADMIN_TOKEN`을 키로 고정 문자열을 HMAC 서명해 쿠키에 담습니다.
 * 토큰 자체는 쿠키·URL·응답에 넣지 않습니다.
 */
export const ADMIN_COOKIE_NAME = "coursecheck_admin";
const SESSION_SUBJECT = "coursecheck-admin-v1";

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 같은 길이 문자열을 상수 시간에 비교합니다. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** ADMIN_TOKEN으로 서명한 세션 값을 만듭니다. */
export async function signAdminSession(token) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(SESSION_SUBJECT)));
}

/** 요청 쿠키에서 관리자 세션을 확인합니다. */
export async function hasAdminSession(request, token) {
  if (!token) return false;
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.slice(ADMIN_COOKIE_NAME.length + 1);
  if (!value) return false;
  return safeEqual(value, await signAdminSession(token));
}

export function adminCookie(value, maxAge) {
  return `${ADMIN_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
