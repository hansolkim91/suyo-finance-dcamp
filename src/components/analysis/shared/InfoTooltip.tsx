import type React from "react";

/**
 * 호버 시 즉시 떠오르는 툴팁 — 지표 옆 ⓘ 아이콘.
 *
 * 왜 HTML title 대신:
 *  - title은 1~2초 지연 후 OS 기본 스타일 → 느리고 못생김
 *  - Tailwind group-hover로 즉시 표시 + 다크모드/테마 일관
 *  - Radix 등 추가 의존성 없이 순수 CSS 동작
 */
export function InfoTooltip({
  label,
  description,
}: {
  label: React.ReactNode;
  description: string;
}) {
  return (
    <span className="group relative inline-flex items-center gap-1">
      <span>{label}</span>
      <span
        aria-label="지표 설명"
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-muted-foreground/50 text-[9px] font-bold text-muted-foreground hover:border-foreground hover:text-foreground"
      >
        i
      </span>
      {/* Tooltip */}
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-64 rounded-md border border-border bg-popover px-3 py-2 text-xs font-normal leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
      >
        {description}
      </span>
    </span>
  );
}
