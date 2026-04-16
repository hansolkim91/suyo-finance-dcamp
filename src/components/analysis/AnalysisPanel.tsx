"use client";

import { useState, useCallback } from "react";
import { PdfUploader } from "@/components/upload/PdfUploader";
import { ResultView } from "@/components/analysis/ResultView";
import type { ChecklistResult } from "@/components/analysis/ResultView";
import { Card, CardContent } from "@/components/ui/card";
import { calculateListedMetrics } from "@/lib/finance/metrics/listed";
import { calculatePrivateMetrics } from "@/lib/finance/metrics/private";
import type { FinancialData } from "@/lib/finance/types";

/**
 * 분석 패널 v3: 원시 FinancialData도 ResultView에 전달
 *
 * 왜 raw data가 필요한가:
 * - metricsPerYear는 비율(%) 지표만 포함
 * - 재무 선배 스타일은 "매출액 333.6조, 영업이익 XX억" 같은 절대 숫자가 먼저 나와야 함
 * - FinancialData.years에 매출액/영업이익/순이익 등 원시 금액이 있음
 */

type YearMetrics = {
  year: string;
  metrics: {
    name: string;
    value: number | null;
    unit: string;
    description: string;
    category?: string;
  }[];
};

type AnalysisState =
  | { status: "idle" }
  | { status: "analyzing"; step: number }
  | {
      status: "done";
      result: ChecklistResult;
      metricsPerYear: YearMetrics[];
      financialData: FinancialData;
    }
  | { status: "error"; message: string };

type AnalysisPanelProps = {
  tabType: "listed" | "private";
};

const STEPS = [
  { message: "PDF를 서버로 전송 중...", sub: "파일 업로드" },
  {
    message: "AI가 재무제표를 읽는 중...",
    sub: "손익계산서, 재무상태표, 현금흐름표 탐색",
  },
  { message: "재무 지표를 계산하는 중...", sub: "수익성, 안정성, 성장성 분석" },
  {
    message: "AI 대시보드를 생성하는 중...",
    sub: "카테고리별 점수 산정 + 종합 의견 작성",
  },
];

function AnalyzingLoader({ step }: { step: number }) {
  const safeStep = Math.min(step, STEPS.length - 1);
  const currentStep = STEPS[safeStep];
  const progress = ((safeStep + 1) / STEPS.length) * 100;

  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-center gap-5 py-10">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-muted" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
          <div className="text-center">
            <p className="text-base font-medium text-foreground">
              {currentStep.message}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentStep.sub}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>
                단계 {safeStep + 1}/{STEPS.length}
              </span>
              <span>잠시만 기다려주세요</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalysisPanel({ tabType }: AnalysisPanelProps) {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  const handleUploadComplete = useCallback(
    async (result: { url: string; pathname: string }) => {
      setState({ status: "analyzing", step: 0 });

      try {
        setState({ status: "analyzing", step: 1 });
        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl: result.url, type: tabType }),
        });

        const analyzeJson = await analyzeRes.json();
        if (!analyzeRes.ok) {
          setState({
            status: "error",
            message: analyzeJson.error || "PDF 분석에 실패했습니다.",
          });
          return;
        }

        setState({ status: "analyzing", step: 2 });
        const data = analyzeJson.data as FinancialData;
        const metricsPerYear =
          tabType === "listed"
            ? calculateListedMetrics(data)
            : calculatePrivateMetrics(data);

        setState({ status: "analyzing", step: 3 });
        const explainRes = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            metrics: metricsPerYear,
            companyName: data.companyName,
            type: tabType,
          }),
        });

        const checklistResult = await explainRes.json();
        if (!explainRes.ok) {
          setState({
            status: "error",
            message: checklistResult.error || "AI 분석에 실패했습니다.",
          });
          return;
        }

        setState({
          status: "done",
          result: checklistResult,
          metricsPerYear,
          financialData: data,
        });
      } catch {
        setState({
          status: "error",
          message: "서버와 통신에 실패했습니다. 다시 시도해주세요.",
        });
      }
    },
    [tabType]
  );

  const handleReset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return (
    <div className="space-y-6">
      {(state.status === "idle" || state.status === "error") && (
        <PdfUploader
          tabType={tabType}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {state.status === "error" && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="font-medium text-destructive">{state.message}</p>
              <p className="text-xs text-muted-foreground">
                다른 PDF 파일로 다시 시도하거나, 텍스트 기반 PDF인지
                확인해주세요.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {state.status === "analyzing" && <AnalyzingLoader step={state.step} />}

      {state.status === "done" && (
        <>
          <ResultView
            result={state.result}
            metricsPerYear={state.metricsPerYear}
            financialData={state.financialData}
            type={tabType}
          />
          <div className="flex justify-center pt-2 pb-8">
            <button
              onClick={handleReset}
              className="rounded-lg border border-muted-foreground/20 px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              다른 PDF 분석하기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
