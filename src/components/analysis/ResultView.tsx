"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

/**
 * 체크리스트 형식의 분석 결과 테이블.
 *
 * 왜 이 형식인가:
 * - 스크린샷처럼 구분 | 핵심 확인 항목 | 확인 방법 | AI 분석 형태로 보여줌
 * - 한눈에 5개 영역의 분석 결과를 파악 가능
 * - 상태 배지(양호/보통/주의)로 직관적 판단
 */

export type ChecklistItem = {
  category: string;
  keyItems: string;
  source: string;
  analysis: string;
  status: "good" | "neutral" | "warning";
};

export type ChecklistResult = {
  companyName: string;
  summary: string;
  rating: number;
  checklist: ChecklistItem[];
};

type ResultViewProps = {
  result: ChecklistResult;
  type: "listed" | "private";
};

const statusConfig = {
  good: {
    label: "양호",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  neutral: {
    label: "보통",
    dot: "bg-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  warning: {
    label: "주의",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
};

export function ResultView({ result, type }: ResultViewProps) {
  const typeLabel = type === "listed" ? "상장사" : "비상장사";

  return (
    <div className="space-y-6">
      {/* 헤더: 회사명 + 요약 + 평점 */}
      <div className="border-b pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">
            {result.companyName}
          </h2>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            {typeLabel}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {result.summary}
        </p>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`text-lg ${i <= result.rating ? "text-amber-400" : "text-gray-300 dark:text-gray-600"}`}
            >
              ★
            </span>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">
            종합 {result.rating}/5
          </span>
        </div>
      </div>

      {/* 체크리스트 테이블 */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-5 py-3">
            <h3 className="text-base font-semibold">
              {typeLabel} 재무제표 분석 체크리스트
            </h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">구분</TableHead>
                  <TableHead className="w-[180px]">핵심 확인 항목</TableHead>
                  <TableHead className="w-[140px]">확인 방법</TableHead>
                  <TableHead>AI 분석</TableHead>
                  <TableHead className="w-[80px] text-center">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.checklist.map((item, i) => {
                  const config = statusConfig[item.status];
                  return (
                    <TableRow key={i}>
                      <TableCell className="align-top font-medium">
                        {item.category}
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {item.keyItems}
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {item.source}
                      </TableCell>
                      <TableCell className="align-top text-sm leading-relaxed">
                        {item.analysis}
                      </TableCell>
                      <TableCell className="align-top text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${config.text}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
                          />
                          {config.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
