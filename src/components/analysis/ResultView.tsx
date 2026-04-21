"use client";

import type { FinancialData } from "@/lib/finance/types";
import { ResultViewListed } from "./ResultViewListed";
import { ResultViewPrivate } from "./ResultViewPrivate";
import type {
  ChecklistResult,
  YearMetrics,
} from "./shared/types";

/**
 * 분석 결과 화면 — type에 따라 상장/비상장 분기.
 *
 * 외부(AnalysisPanel.tsx)에서 import하는 표면을 유지하기 위해
 * `ChecklistResult`, `ChecklistItem`, `CategoryScores`도 re-export.
 */

export type {
  ChecklistResult,
  ChecklistItem,
  CategoryScores,
} from "./shared/types";

type ResultViewProps = {
  result: ChecklistResult;
  metricsPerYear: YearMetrics[];
  financialData: FinancialData;
  type: "listed" | "private";
};

export function ResultView({
  result,
  metricsPerYear,
  financialData,
  type,
}: ResultViewProps) {
  if (type === "private") {
    return (
      <ResultViewPrivate
        result={result}
        metricsPerYear={metricsPerYear}
        financialData={financialData}
      />
    );
  }
  return (
    <ResultViewListed
      result={result}
      metricsPerYear={metricsPerYear}
      financialData={financialData}
    />
  );
}
