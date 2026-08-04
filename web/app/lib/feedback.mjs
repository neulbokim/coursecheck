/** 건의 분류. 값(key)만 서버에 저장합니다. */
export const feedbackCategories = [
  { key: "bug", label: "안 되는 게 있어요", hint: "빠진 과목, 잘못된 시간표, 오류 화면" },
  { key: "curriculum", label: "요람·교양 정보가 달라요", hint: "학번별 필수 교양이나 연계전공 과목표" },
  { key: "idea", label: "이런 기능이 있으면 좋겠어요", hint: "새 기능이나 편의 개선" },
  { key: "etc", label: "그 외 하고 싶은 말", hint: "칭찬, 불만, 아무 말" },
];

export const FEEDBACK_MIN_LENGTH = 5;
export const FEEDBACK_MAX_LENGTH = 1000;
export const FEEDBACK_DAILY_LIMIT = 10;
export const feedbackStatuses = ["new", "reading", "done"];

/**
 * 건의 입력을 검사합니다.
 * @param {{ category?: unknown, message?: unknown }} input
 * @returns {{ ok: true, category: string, message: string } | { ok: false, error: string }}
 */
export function validateFeedback(input) {
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!feedbackCategories.some((item) => item.key === category)) {
    return { ok: false, error: "건의 종류를 다시 선택해 주세요." };
  }
  if (message.length < FEEDBACK_MIN_LENGTH) {
    return { ok: false, error: `${FEEDBACK_MIN_LENGTH}자 이상 적어주세요.` };
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, error: `${FEEDBACK_MAX_LENGTH}자 이내로 적어주세요.` };
  }
  return { ok: true, category, message };
}
