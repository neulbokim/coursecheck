/**
 * 서버에서 일어난 일을 내 컴퓨터의 파일에도 한 줄씩 남깁니다.
 *
 * `analytics-events.jsonl`은 화면에서 올라온 이용 기록 사본이고,
 * `everytime-failures.jsonl`은 에브리타임을 읽다가 실패한 사유입니다.
 * 데이터베이스와 화면이 정답이고 이 파일들은 개발할 때 눈으로 보는 사본이라
 * 세 가지를 지킵니다.
 *
 * 1. 배포에서는 아무 일도 하지 않습니다. Vercel은 파일 시스템이 읽기 전용이고,
 *    적더라도 다음 요청에서 사라지므로 남길 이유가 없습니다.
 * 2. 실패해도 조용히 넘어갑니다. 사본을 못 적었다고 응답이 깨지면 안 됩니다.
 * 3. 사람과 이어지는 값은 넣지 않습니다. 방문자 ID·IP·사용자 에이전트·에브리타임
 *    링크와 토큰은 받지 않고, 무엇이 왜 안 됐는지만 받습니다.
 *
 * 폴더는 `LOCAL_LOG_DIR`로 바꿀 수 있고, `off`로 두면 개발 중에도 적지 않습니다.
 */
const DEFAULT_DIRECTORY = ".local-logs";

function targetDirectory() {
  const configured = (process.env.LOCAL_LOG_DIR ?? "").trim();
  if (configured.toLowerCase() === "off") return "";
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "" : DEFAULT_DIRECTORY;
}

/** `fileName`은 부르는 쪽이 정해 둔 이름이라 밖에서 들어온 값을 받지 않습니다. */
export async function appendLocalLog(fileName, entry) {
  const directory = targetDirectory();
  if (!directory) return;
  try {
    const [{ appendFile, mkdir }, { dirname, resolve }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const absolute = resolve(process.cwd(), directory, fileName);
    await mkdir(dirname(absolute), { recursive: true });
    await appendFile(absolute, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // 사본이므로 여기서 끝냅니다 — 실패를 위로 던지지 않습니다.
  }
}
