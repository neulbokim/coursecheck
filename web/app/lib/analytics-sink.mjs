/**
 * 운영 집계용 기록을 데이터베이스에 넣을지 정합니다.
 *
 * 개발 서버도 `.env.local`의 `DATABASE_URL`을 그대로 쓰기 때문에, 손으로 눌러 본 것까지
 * 운영 집계에 그대로 섞입니다. 게다가 **되돌릴 수 없습니다** — 이용 기록은 선택 동의를
 * 하지 않으면 방문자 ID도 속성도 붙지 않는 익명 행이라, 나중에 지우려 해도 같은 시간대
 * 다른 사람의 기록과 구분되지 않습니다. 그래서 기본을 「배포에서만 넣는다」로 둡니다.
 *
 * 대상은 앱이 도는 데 필요 없는, 관리 화면에서 세어 보기만 하는 두 표입니다.
 *
 * | 표 | 무엇 |
 * | --- | --- |
 * | `analytics_events` | 이용 기록 |
 * | `everytime_failures` | 에브리타임 실패 사유 |
 *
 * 설정(`user_profiles`)과 건의(`feedback_messages`)는 끄지 않습니다. 설정은 저장한 값을
 * 다시 읽어야 화면이 도므로 개발 중에도 필요하고, 건의는 사람이 직접 쓴 것이라 눌러서
 * 실수로 생기지 않습니다.
 *
 * 어느 쪽이든 `.local-logs/*.jsonl` 사본은 그대로 남으므로, 껐다고 개발 중에 무슨 일이
 * 일어났는지 못 보게 되지는 않습니다.
 *
 * - `ANALYTICS_SINK=on` — 개발 중에도 넣습니다 (데이터베이스 경로를 확인할 때)
 * - `ANALYTICS_SINK=off` — 배포에서도 넣지 않습니다
 * - 비워 두면 배포에서만 넣습니다
 */
export function shouldStoreAnalytics() {
  const configured = (process.env.ANALYTICS_SINK ?? "").trim().toLowerCase();
  if (configured === "on") return true;
  if (configured === "off") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * 배포된 화면을 만드는 사람이 직접 눌러 볼 때도 집계에 섞이지 않게, **관리자로 로그인한
 * 브라우저**는 세지 않습니다.
 *
 * 진입화면에 비밀번호 칸을 따로 두지 않은 이유가 있습니다. `/admin` 로그인이 이미
 * 시도 제한(10분 5회 → 15분 잠금)과 서명·만료가 든 `HttpOnly` 쿠키를 갖추고 있어서,
 * 가장 많이 열리는 페이지에 인증면을 하나 더 여는 것은 지킬 것을 늘리기만 합니다.
 * 여기서는 그 쿠키가 있는지만 확인하므로 새 비밀번호도, 새 입력 칸도 필요 없습니다.
 *
 * 판정은 서버가 합니다 — 쿠키가 `HttpOnly`라 화면 코드가 읽지도 지어내지도 못하고,
 * 서명에 만료시각이 들어 있어 복사해 둔 값도 8시간 뒤에는 통하지 않습니다.
 *
 * `ADMIN_TOKEN`이 없으면(로컬에서 관리 기능을 끄고 띄운 경우) 아무도 관리자가 아니므로
 * 그냥 셉니다.
 *
 * @param {Request} request
 * @returns {Promise<boolean>}
 */
export async function isAdminBrowser(request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const { verifyAdminSession } = await import("./admin-session.mjs");
  return verifyAdminSession(request, token);
}
