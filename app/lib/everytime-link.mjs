const EVERYTIME_URL_PATTERN = /https:\/\/(?:www\.)?everytime\.kr\/(?:app\/)?@[A-Za-z0-9_-]{16,64}/i;

/**
 * 에브리타임의 '복사' 문구나 단독 URL에서 공개 시간표 링크만 반환합니다.
 * 링크가 아직 완성되지 않은 직접 입력은 그대로 유지합니다.
 * @param {string} input
 */
export function extractEverytimeUrl(input) {
  const value = typeof input === "string" ? input.trim() : "";
  return value.match(EVERYTIME_URL_PATTERN)?.[0] ?? value;
}
