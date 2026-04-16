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
 * 분석 패널: 업로드 → 분석 → 체크리스트 표시
 *
 * 변경된 흐름:
 * 1. PDF 업로드 (Blob)
 * 2. /api/analyze → 재무 데이터 추출 (AI)
 * 3. 클라이언트에서 지표 계산
 * 4. /api/explain → 체크리스트 분석 (AI, 구조화 JSON)
 * 5. 체크리스트 테이블 표시
 *
 * 왜 2단계 AI 호출인가:
 * - 1차(analyze): PDF에서 숫자를 정확히 뽑아내는 데 집중
 * - 2차(explain): 뽑아낸 숫자로 체크리스트 분석을 작성
 * - 역할을 나누면 각 단계의 정확도가 올라감
 */

type AnalysisState =
  | { status: "idle" }
  | { status: "analyzing"; step: number }
  | { status: "done"; result: ChecklistResult }
  | { status: "error"; message: string };

type AnalysisPanelProps = {
  tabType: "listed" | "private";
};

const STEPS = [
  { message: "PDF를 서버로 전송 중...", sub: "파일 업로드" },
  { message: "AI가 재무제표를 읽는 중...", sub: "손익계산서, 재무상태표, 현금흐름표 탐색" },
  { message: "재무 지표를 계산하는 중...", sub: "수익성, 안정성, 성장성 분석" },
  { message: "체크리스트 분석을 작성하는 중...", sub: "AI가 5개 항목별 분석 생성 중" },
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
        // 1단계: PDF에서 재무 데이터 추출
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

        // 2단계: 지표 계산
        setState({ status: "analyzing", step: 2 });
        const data = analyzeJson.data as FinancialData;
        const metricsPerYear =
          tabType === "listed"
            ? calculateListedMetrics(data)
            : calculatePrivateMetrics(data);

        // 3단계: AI 체크리스트 분석
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

        setState({ status: "done", result: checklistResult });
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
        <PdfUploader tabType={tabType} onUploadComplete={handleUploadComplete} />
      )}

      {state.status === "error" && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="font-medium text-destructive">{state.message}</p>
              <p className="text-xs text-muted-foreground">
                다른 PDF 파일로 다시 시도하거나, 텍스트 기반 PDF인지 확인해주세요.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {state.status === "analyzing" && <AnalyzingLoader step={state.step} />}

      {state.status === "done" && (
        <>
          <ResultView result={state.result} type={tabType} />
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
