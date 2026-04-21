import type React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusDot } from "./badges";
import type { ChecklistItem, Status } from "./types";

/**
 * 카테고리 카드 — 좌측 보더 색으로 상태 표시 + AI 해설 박스 내장.
 */
export function CategoryCard({
  item,
  children,
}: {
  item: ChecklistItem;
  children?: React.ReactNode;
}) {
  const borderColor = {
    good: "border-l-emerald-500",
    neutral: "border-l-amber-400",
    warning: "border-l-red-500",
  };

  return (
    <Card className={`border-l-4 ${borderColor[item.status]}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{item.category}</CardTitle>
          {statusDot(item.status)}
        </div>
        <p className="text-xs text-muted-foreground">
          {item.keyItems} | 출처: {item.source}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">
            AI 분석
          </p>
          <p className="text-sm leading-relaxed">{item.analysis}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * KPI 미니 카드 — 큰 숫자 + 라벨 + 상태 + 옵션 sub.
 */
export function KpiMini({
  label,
  value,
  status,
  sub,
}: {
  label: string;
  value: string;
  status: Status;
  sub?: React.ReactNode;
}) {
  const textColor = {
    good: "text-emerald-700 dark:text-emerald-400",
    neutral: "text-amber-700 dark:text-amber-400",
    warning: "text-red-700 dark:text-red-400",
  };

  return (
    <div className="rounded-lg border p-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-xl font-bold tabular-nums ${textColor[status]}`}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {statusDot(status)}
        {sub}
      </div>
    </div>
  );
}
