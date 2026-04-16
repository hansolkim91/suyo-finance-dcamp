"use client";

import { useCompletion } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * AI 해설 스트리밍 컴포넌트.
 * useCompletion 훅으로 /api/explain에서 스트리밍 텍스트를 받아 실시간 표시.
 *
 * 왜 useCompletion인가:
 * - useChat은 대화형(멀티턴)용이고, 여기서는 단발성 해설만 필요
 * - useCompletion은 단발성 텍스트 생성에 적합
 *
 * 개선 사항:
 * - 애니메이션 로딩 텍스트 (분석 단계별 메시지)
 * - 마크다운 스타일링 (prose 클래스 활용)
 * - 실패 시 구체적 안내 메시지
 */

type AiExplanationProps = {
  metrics: unknown;
  companyName: string;
  type: "listed" | "private";
};

// 로딩 중 순환 표시할 메시지들
const LOADING_MESSAGES = [
  "재무 지표를 분석하고 있습니다...",
  "수익성과 안정성을 평가하는 중...",
  "업종 평균과 비교하는 중...",
  "종합 의견을 작성하는 중...",
];

function LoadingAnimation() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      {/* 펄스 아이콘 */}
      <div className="relative">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full bg-primary/30 animate-ping absolute" />
          <span className="relative text-lg">🤖</span>
        </div>
      </div>
      {/* 메시지 */}
      <p className="text-sm font-medium text-muted-foreground animate-pulse transition-all">
        {LOADING_MESSAGES[messageIndex]}
      </p>
      {/* 진행 점 */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function AiExplanation({
  metrics,
  companyName,
  type,
}: AiExplanationProps) {
  const { completion, isLoading, complete, error } = useCompletion({
    api: "/api/explain",
  });

  // 컴포넌트가 마운트되면 자동으로 해설 요청
  useEffect(() => {
    complete("", {
      body: { metrics, companyName, type },
    });
    // 마운트 시 1회만 호출
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <Card className="border-amber-200 dark:border-amber-800">
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="text-xl">⚠️</span>
            </div>
            <div>
              <p className="font-medium text-foreground">
                AI 해설을 불러오지 못했습니다
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error.message.includes("rate")
                  ? "AI API 호출 한도에 도달했습니다. 잠시 후 다시 시도해주세요."
                  : error.message.includes("NO_API_KEY")
                    ? "AI API 키가 설정되지 않았습니다. 관리자에게 문의해주세요."
                    : "일시적인 오류가 발생했습니다. 페이지를 새로고침하면 다시 시도됩니다."}
              </p>
            </div>
            <p className="text-xs text-muted-foreground/60">
              위의 재무 지표 수치는 정상적으로 계산되었으니 참고하실 수 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span>🤖</span>
          AI 분석 해설
          {isLoading && (
            <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {completion ? (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-headings:font-semibold prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-p:text-muted-foreground prose-p:leading-relaxed prose-strong:text-foreground prose-li:text-muted-foreground prose-ul:my-2 whitespace-pre-wrap">
            {completion}
          </div>
        ) : isLoading ? (
          <LoadingAnimation />
        ) : null}
      </CardContent>
    </Card>
  );
}
