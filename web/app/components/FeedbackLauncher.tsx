"use client";

import { useState } from "react";
import FeedbackChat from "./FeedbackChat";
import { postEvent } from "../lib/track.mjs";

/**
 * 오른쪽 아래 건의하기 단추. 시간표 화면과 약관 화면에서 함께 씁니다.
 *
 * 시간표 화면은 "아쉬웠어요"를 눌렀을 때도 창을 열어야 해서 바깥에서 상태를
 * 넘겨줍니다. 넘기지 않으면 스스로 상태를 들고 동작합니다.
 */
type Props = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function FeedbackLauncher({ open, onOpenChange }: Props) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;

  function setOpen(next: boolean) {
    if (onOpenChange) onOpenChange(next);
    else setOwnOpen(next);
  }

  return (
    <>
      <button
        className="feedback-launcher"
        type="button"
        onClick={() => {
          setOpen(true);
          postEvent("feedback_open");
        }}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">✉</span>개발자에게 건의하기
      </button>
      {isOpen && <FeedbackChat onClose={() => setOpen(false)} />}
    </>
  );
}
