"use client";

import { ResultViewListed } from "./ResultViewListed";
import type { FinancialData } from "@/lib/finance/types";
import type { ChecklistResult, YearMetrics } from "./shared/types";

/**
 * 비상장사 재무 분석 화면 — 임시 스텁.
 *
 * 현재는 상장 화면(`ResultViewListed`)을 그대로 재사용하여 회귀를 막는다.
 * 8단계에서 비상장 8섹션(현금/Burn/Runway/BEP 등)으로 완전 재작성 예정.
 */

type ResultViewPrivateProps = {
  result: ChecklistResult;
  metricsPerYear: YearMetrics[];
  financialData: FinancialData;
};

export function ResultViewPrivate(props: ResultViewPrivateProps) {
  // TODO (8단계): 비상장 전용 8섹션으로 재작성
  return <ResultViewListed {...props} />;
}
