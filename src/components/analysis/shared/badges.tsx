import type React from "react";
import type { Status } from "./types";

/**
 * 신호등/뱃지/색상 헬퍼 — 화면 전반에서 일관된 시각 코드.
 */

export function statusDot(status: Status): React.ReactNode {
  const colors = {
    good: "bg-emerald-500",
    neutral: "bg-amber-400",
    warning: "bg-red-500",
  };
  const labels = { good: "양호", neutral: "보통", warning: "주의" };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />
      <span className="text-xs text-muted-foreground">{labels[status]}</span>
    </span>
  );
}

export function yoyBadge(yoy: number | null): React.ReactNode {
  if (yoy === null) return <span className="text-xs text-gray-400">-</span>;
  const isPositive = yoy > 0;
  const color = isPositive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  const arrow = isPositive ? "▲" : "▼";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {Math.abs(yoy).toFixed(1)}%
    </span>
  );
}

export function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function getScoreGradient(score: number): string {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return "우수";
  if (score >= 70) return "양호";
  if (score >= 50) return "보통";
  if (score >= 40) return "미흡";
  return "위험";
}

/**
 * 지표명을 보고 신호등 상태를 추정한다.
 * 7단계에서 thresholds.ts로 이전 예정 — 일단 호환성 유지.
 */
export function getMetricStatus(
  name: string,
  value: number | null
): Status {
  if (value === null) return "neutral";
  if (name.includes("영업이익률"))
    return value > 10 ? "good" : value >= 5 ? "neutral" : "warning";
  if (name.includes("순이익률"))
    return value > 7 ? "good" : value >= 3 ? "neutral" : "warning";
  if (name.includes("ROE"))
    return value > 15 ? "good" : value >= 10 ? "neutral" : "warning";
  if (name.includes("ROA"))
    return value > 5 ? "good" : value >= 2 ? "neutral" : "warning";
  if (name.includes("부채비율"))
    return value < 100 ? "good" : value <= 200 ? "neutral" : "warning";
  if (name.includes("자기자본비율"))
    return value > 50 ? "good" : value >= 30 ? "neutral" : "warning";
  if (name.includes("유동비율"))
    return value > 200 ? "good" : value >= 100 ? "neutral" : "warning";
  if (name.includes("이자보상배율"))
    return value > 3 ? "good" : value >= 1 ? "neutral" : "warning";
  if (name.includes("성장률"))
    return value > 10 ? "good" : value >= 0 ? "neutral" : "warning";
  if (name.includes("매출총이익률"))
    return value > 30 ? "good" : value >= 15 ? "neutral" : "warning";
  if (name.includes("EBITDA"))
    return value > 15 ? "good" : value >= 8 ? "neutral" : "warning";
  if (name.includes("Runway"))
    return value >= 18 ? "good" : value >= 6 ? "neutral" : "warning";
  return "neutral";
}
