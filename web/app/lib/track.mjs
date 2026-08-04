/**
 * 이용 기록 한 줄 보내기. 여러 화면에서 쓰므로 여기 한 곳에 둡니다.
 *
 * 누가 쏜 것인지는 서버가 방문자 쿠키로 판단합니다. 쿠키가 HttpOnly라 브라우저
 * 코드는 읽을 수 없고, 소속·전공·학번·이수학기는 서버가 저장된 설정에서 직접
 * 가져옵니다. 그러니 여기서는 이름과 묶음 값만 보냅니다.
 */
export function postEvent(event, resultBucket) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, resultBucket }),
    keepalive: true,
  }).catch(() => undefined);
}
