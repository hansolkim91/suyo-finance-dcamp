import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 체크리스트 분석 API
 *
 * 기존: streamText로 자유형 마크다운 스트리밍
 * 변경: generateObject로 구조화된 체크리스트 JSON 반환
 *
 * 왜 바꿨나:
 * - 스크린샷처럼 표 형식으로 보여주려면 구조화된 데이터가 필요
 * - 각 구분(사업모델, 매출흐름 등)별로 AI 분석을 표 셀에 넣으려면 JSON이 적합
 */

const checklistItemSchema = z.object({
  category: z
    .string()
    .describe("분석 구분 (예: 사업모델, 매출·이익 흐름 등)"),
  keyItems: z
    .string()
    .describe("이 구분에서 확인한 핵심 항목 나열"),
  source: z
    .string()
    .describe("데이터 출처 (예: 포괄손익계산서, 재무상태표 등)"),
  analysis: z
    .string()
    .describe("AI의 상세 분석 결과 (4~6문장, 구체적 수치 인용)"),
  status: z
    .enum(["good", "neutral", "warning"])
    .describe("종합 판단: good=양호, neutral=보통, warning=주의"),
});

const checklistSchema = z.object({
  companyName: z.string(),
  summary: z
    .string()
    .describe("이 회사의 재무 상태를 2~3문장으로 핵심 요약"),
  rating: z.number().describe("종합 평가 점수, 1~5 사이 정수"),
  checklist: z.array(checklistItemSchema),
});

/**
 * explain은 Gemini 우선 사용.
 *
 * 왜: analyze(데이터 추출)에서 Anthropic 토큰을 이미 소모하므로,
 * 바로 이어서 explain도 Anthropic을 쓰면 분당 10,000 토큰 한도에 걸림.
 * Gemini로 역할을 분담하면 rate limit 회피 + 비용 절감.
 */
function getModel(): LanguageModel {
  // 1순위: Gemini (rate limit 분산)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    return google("gemini-2.5-flash");
  }

  // 2순위: Anthropic (폴백)
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic("claude-sonnet-4-6");
  }

  throw new Error("NO_API_KEY");
}

export async function POST(request: Request) {
  let model: LanguageModel;
  try {
    model = getModel();
  } catch {
    return Response.json(
      { error: "AI API 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const { metrics, companyName, type } = await request.json();
  const typeLabel = type === "listed" ? "상장사" : "비상장 스타트업";

  const listedPrompt = `당신은 한국 상장사 재무분석 전문가입니다.
주어진 재무 지표를 바탕으로 "상장사 재무제표 분석 체크리스트" 5개 항목을 분석하세요.

5개 구분 (반드시 이 순서로):
1. 사업모델 — keyItems: 수익원(제품·플랫폼·구독 등)과 비용구조 / source: 사업보고서 요약/사업부문 설명
2. 매출·이익 흐름 — keyItems: 최근 3~5년 매출·영업이익·순이익 추이 / source: 포괄손익계산서(손익계산서)
3. 재무건전성 — keyItems: 부채비율, 현금·현금성자산, 이자보상배율 / source: 재무상태표, 현금흐름표
4. 리스크 신호 — keyItems: 자본잠식, 감자·증자·주식소각, 감사의견 / source: 재무상태표, 감사보고서 강조사항
5. 비교·평가 — keyItems: 업종 평균 대비 성장성·수익성·가치지표 / source: 동일 업종 지표 비교

규칙:
- 한국어로 작성, 재무 초보자도 이해 가능하게
- 각 analysis에 반드시 구체적 수치를 인용 (예: "영업이익률 15.3%로...")
- 다년 데이터가 있으면 반드시 추세 언급
- analysis는 4~6문장으로 핵심을 짧고 밀도 있게`;

  const privatePrompt = `당신은 스타트업/비상장사 재무분석 전문가입니다.
주어진 재무 지표를 바탕으로 "비상장사 재무 분석 체크리스트" 5개 항목을 분석하세요.

5개 구분 (반드시 이 순서로):
1. 사업모델 — keyItems: 수익원과 비용구조 / source: 손익계산서
2. 현금 소진 (Burn Rate) — keyItems: Gross/Net Burn Rate, Runway / source: 현금흐름표, 재무상태표
3. 손익 구조 — keyItems: BEP 달성률, 매출총이익률, 매출 성장률 / source: 포괄손익계산서
4. 현금 흐름 건전성 — keyItems: 영업활동현금흐름, 기말 현금잔고 / source: 현금흐름표
5. 리스크 & 기회 — keyItems: 재무 리스크, 성장 가능성 / source: 종합 분석

규칙:
- 한국어, 재무 초보자 눈높이
- 구체적 수치 반드시 인용
- 스타트업 특성 고려 (적자는 성장 단계에서 정상일 수 있음)
- analysis는 4~6문장으로 핵심만`;

  const systemPrompt = type === "listed" ? listedPrompt : privatePrompt;

  try {
    const { object } = await generateObject({
      model,
      schema: checklistSchema,
      system: systemPrompt,
      prompt: `기업명: ${companyName}
분석 유형: ${typeLabel}

재무 지표:
${JSON.stringify(metrics, null, 2)}`,
    });

    return Response.json(object);
  } catch (error) {
    console.error("Explain error:", error);
    return Response.json(
      { error: "AI 분석에 실패했습니다.", detail: (error as Error).message },
      { status: 500 }
    );
  }
}
