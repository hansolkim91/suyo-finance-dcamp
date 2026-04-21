"use client";

import type React from "react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 호버 시 즉시 떠오르는 툴팁 — 지표 옆 ⓘ 아이콘.
 *
 * 왜 Portal + fixed:
 *  - 부모에 overflow-x-auto / overflow-hidden 있으면 absolute 툴팁이 잘림
 *  - createPortal로 document.body 직하에 렌더링 → 부모 overflow·z-index와 무관
 *  - 앵커 엘리먼트의 getBoundingClientRect로 위치 계산 → fixed position
 */
export function InfoTooltip({
  label,
  description,
}: {
  label: React.ReactNode;
  description: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  const handleEnter = () => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ left: rect.left, top: rect.bottom + 6 });
    }
    setShow(true);
  };

  const handleLeave = () => setShow(false);

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex items-center gap-1"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <span>{label}</span>
        <span
          aria-label="지표 설명"
          className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-muted-foreground/50 text-[9px] font-bold text-muted-foreground"
        >
          i
        </span>
      </span>
      {show &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              maxWidth: "16rem",
            }}
            className="z-[9999] rounded-md border border-border bg-popover px-3 py-2 text-xs font-normal leading-relaxed text-popover-foreground shadow-lg"
          >
            {description}
          </div>,
          document.body
        )}
    </>
  );
}
