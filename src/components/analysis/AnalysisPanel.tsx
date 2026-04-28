"use client";

import { useState, useCallback } from "react";
import { PdfUploader } from "@/components/upload/PdfUploader";
import { StockSearchInput } from "@/components/upload/StockSearchInput";
import { ResultView } from "@/components/analysis/ResultView";
import type { ChecklistResult } from "@/components/analysis/ResultView";
import { Card, CardContent } from "@/components/ui/card";
import { calculateListedMetrics } from "@/lib/finance/metrics/listed";
import { calculatePrivateMetrics } from "@/lib/finance/metrics/private";
import type { FinancialData } from "@/lib/finance/types";

/**
 * 분석 패널 v5: PDF + DART 두 입력 모드 지원 (상장사 한정).
 *
 * 흐름 분기:
 *   - 상장 + DART 모드: 회사명 자동완성 → /api/analyze-by-code → metrics → /api/explain
 *   - 상장 + PDF 모드 / 비상장: 기존 /api/analyze → metrics → /api/explain
 *
 * 왜 한 패널에서 분기:
 *   - 분석 결과 화면(ResultView)은 두 모드 동일 → 분기는 입력부에서만
 *   - 상태 관리(analyzing/done/error)도 동일하게 재사용
 *   - 파일 분리하면 중복 코드 ↑
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
  | { status: "analyzing"; step: number; source: "pdf" | "dart" }
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

const STEPS_PDF = [
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

const STEPS_DART = [
  {
    message: "DART에서 재무제표 조회 중...",
    sub: "전자공시시스템 API 호출",
  },
  { message: "재무 지표를 계산하는 중...", sub: "수익성, 안정성, 성장성 분석" },
  {
    message: "AI 대시보드를 생성하는 중...",
    sub: "카테고리별 점수 산정 + 종합 의견 작성",
  },
];

function AnalyzingLoader({
  step,
  source,
}: {
  step: number;
  source: "pdf" | "dart";
}) {
  const steps = source === "pdf" ? STEPS_PDF : STEPS_DART;
  const safeStep = Math.min(step, steps.length - 1);
  const currentStep = steps[safeStep];
  const progress = ((safeStep + 1) / steps.length) * 100;

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
                단계 {safeStep + 1}/{steps.length}
              </span>
              <span>잠시만 기다려주세요</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 입력 모드 토글 — 상장 탭에서만 표시 (컴팩트한 segment control).
 *
 * 큰 박스로 두 개 두는 대신 작은 segment로 만들어 검색 입력박스가
 * 시각적 메인 액션이 되도록 한다.
 */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: "dart" | "pdf";
  onChange: (m: "dart" | "pdf") => void;
}) {
  const baseBtn =
    "flex-1 px-4 py-2 text-sm font-medium transition-all rounded-md";
  const active = "bg-background text-foreground shadow-sm";
  const inactive =
    "text-muted-foreground hover:text-foreground";

  return (
    <div className="inline-flex w-full max-w-md rounded-lg bg-muted p-1">
      <button
        type="button"
        onClick={() => onChange("dart")}
        className={`${baseBtn} ${mode === "dart" ? active : inactive}`}
      >
        <span className="mr-1">📊</span>
        DART 직조회
      </button>
      <button
        type="button"
        onClick={() => onChange("pdf")}
        className={`${baseBtn} ${mode === "pdf" ? active : inactive}`}
      >
        <span className="mr-1">📄</span>
        PDF 업로드
      </button>
    </div>
  );
}

export function AnalysisPanel({ tabType }: AnalysisPanelProps) {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const [inputMode, setInputMode] = useState<"dart" | "pdf">("dart");

  /**
   * 공통 분석 흐름: financialData → metrics → /api/explain → done
   * (PDF/DART 두 경로 모두 financialData 손에 쥐고 호출)
   */
  const runExplainPipeline = useCallback(
    async (data: FinancialData, source: "pdf" | "dart") => {
      const metricsBaseStep = source === "pdf" ? 2 : 1;
      setState({ status: "analyzing", step: metricsBaseStep, source });

      const metricsPerYear =
        tabType === "listed"
          ? calculateListedMetrics(data)
          : calculatePrivateMetrics(data);

      setState({ status: "analyzing", step: metricsBaseStep + 1, source });
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
    },
    [tabType]
  );

  // ── PDF 흐름 ──
  const handleUploadComplete = useCallback(
    async (result: { url: string; pathname: string }) => {
      setState({ status: "analyzing", step: 0, source: "pdf" });

      try {
        setState({ status: "analyzing", step: 1, source: "pdf" });
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

        await runExplainPipeline(analyzeJson.data as FinancialData, "pdf");
      } catch {
        setState({
          status: "error",
          message: "서버와 통신에 실패했습니다. 다시 시도해주세요.",
        });
      }
    },
    [tabType, runExplainPipeline]
  );

  // ── DART 흐름 ──
  const handleStockSelect = useCallback(
    async (stockCode: string, _corpName: string) => {
      setState({ status: "analyzing", step: 0, source: "dart" });

      try {
        const res = await fetch("/api/analyze-by-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockCode }),
        });

        const json = await res.json();
        if (!res.ok) {
          setState({
            status: "error",
            message:
              json.error ||
              "DART 조회에 실패했습니다. PDF 모드로 시도해보세요.",
          });
          return;
        }

        await runExplainPipeline(json.data as FinancialData, "dart");
      } catch {
        setState({
          status: "error",
          message: "서버와 통신에 실패했습니다. 다시 시도해주세요.",
        });
      }
    },
    [runExplainPipeline]
  );

  const handleReset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  // ── 입력부 렌더링 ──
  const renderInput = () => {
    // 비상장: PDF만
    if (tabType === "private") {
      return (
        <PdfUploader
          tabType={tabType}
          onUploadComplete={handleUploadComplete}
        />
      );
    }
    // 상장: 토글 + 모드별 입력
    return (
      <div className="space-y-4">
        <ModeToggle mode={inputMode} onChange={setInputMode} />
        {inputMode === "dart" ? (
          <StockSearchInput onSelect={handleStockSelect} />
        ) : (
          <PdfUploader
            tabType={tabType}
            onUploadComplete={handleUploadComplete}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {(state.status === "idle" || state.status === "error") && renderInput()}

      {state.status === "error" && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent>
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <p className="font-medium text-destructive leading-relaxed">
                {state.message}
              </p>
              <p className="text-xs text-muted-foreground">
                위 입력 영역에서 다시 시도해주세요.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {state.status === "analyzing" && (
        <AnalyzingLoader step={state.step} source={state.source} />
      )}

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
              다른 회사 분석하기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
