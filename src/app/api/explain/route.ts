import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 체크리스트 분석 API (v2 — 대시보드용)
 *
 * v1 대비 변경:
 * - categoryScores 추가: 레이더 차트에 사용할 카테고리별 0~100 점수
 * - overallScore 추가: 종합 점수 (반원 게이지용)
 * - insight 추가: AI 종합 의견 (별도 하이라이트 박스용)
 *
 * 왜: 리서치 결과, 숫자+차트+AI 코멘트가 분리되어야 사용자가 읽기 쉬움
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

const categoryScoresSchema = z.object({
  profitability: z.number().describe("수익성 점수, 0~100 정수"),
  stability: z.number().describe("안정성 점수, 0~100 정수"),
  growth: z.number().describe("성장성 점수, 0~100 정수"),
  efficiency: z.number().describe("효율성 점수, 0~100 정수"),
  cashflow: z.number().describe("현금창출력 점수, 0~100 정수"),
});

const checklistSchema = z.object({
  companyName: z.string(),
  summary: z
    .string()
    .describe("이 회사의 재무 상태를 2~3문장으로 핵심 요약"),
  insight: z
    .string()
    .describe(
      "AI 종합 의견: 강점 2가지, 약점 2가지, 주목 포인트 1가지를 구체적 수치와 함께 5~8문장으로 작성"
    ),
  overallScore: z
    .number()
    .describe("종합 재무 건전성 점수, 0~100 정수"),
  categoryScores: categoryScoresSchema,
  checklist: z.array(checklistItemSchema),
});

/**
 * explain은 Gemini 우선 사용.
 *
 * 왜: analyze(데이터 추출)에서 Anthropic 토큰을 이미 소모하므로,
 * Gemini로 역할을 분담하면 rate limit 회피 + 비용 절감.
 */
function getModel(): LanguageModel {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    return google("gemini-2.5-flash");
  }

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
주어진 재무 지표를 바탕으로 분석하세요.

[체크리스트 5개 구분] (반드시 이 순서로):
1. 사업모델 — keyItems: 수익원(제품·플랫폼·구독 등)과 비용구조 / source: 사업보고서 요약/사업부문 설명
2. 매출·이익 흐름 — keyItems: 최근 3~5년 매출·영업이익·순이익 추이 / source: 포괄손익계산서(손익계산서)
3. 재무건전성 — keyItems: 부채비율, 현금·현금성자산, 이자보상배율 / source: 재무상태표, 현금흐름표
4. 리스크 신호 — keyItems: 자본잠식, 감자·증자·주식소각, 감사의견 / source: 재무상태표, 감사보고서 강조사항
5. 비교·평가 — keyItems: 업종 평균 대비 성장성·수익성·가치지표 / source: 동일 업종 지표 비교

[카테고리별 점수 기준] (0~100):
- 수익성: 영업이익률 20%이상=90점, 10~20%=70점, 5~10%=50점, 0~5%=30점, 적자=10점
- 안정성: 부채비율 50%이하=90점, 100%이하=70점, 200%이하=50점, 200%초과=30점
- 성장성: 매출성장률 20%이상=90점, 10~20%=70점, 0~10%=50점, 역성장=20점
- 효율성: ROE 20%이상=90점, 15~20%=70점, 10~15%=50점, 10%미만=30점
- 현금창출력: 영업CF 양수+현금충분=90점, 영업CF 양수=60점, 영업CF 음수=20점

[종합 점수] = 5개 카테고리 점수의 가중 평균 (수익성 25%, 안정성 25%, 성장성 20%, 효율성 15%, 현금창출력 15%)

[중요 — 데이터 없는 카테고리 처리]:
- 현금창출력 관련 데이터(영업활동현금흐름, 현금잔고)가 null이면:
  → 현금창출력 점수를 0이 아닌 50으로 기본 설정 (데이터 부족으로 판단 불가)
  → 다른 지표(부채비율, 유동비율 등)로 간접 추정
- 어떤 카테고리든 데이터가 전혀 없으면 점수를 50으로 설정 (0 금지)
- 0점은 "확실히 나쁜" 경우에만 부여

[사업모델 분석 가이드]:
- 이 기업이 어떤 제품/서비스로 돈을 버는지 추정
- 매출원가율로 제조업/서비스업/플랫폼 등 비즈니스 유형 판단
- 매출 규모와 성장 추세로 시장 내 위치 추정
- 주요 비용 구조(원가 vs 판관비 비중)로 사업 특성 파악
- analysis를 6~8문장으로 상세하게 작성

규칙:
- 한국어, 재무 초보자도 이해 가능
- analysis에 반드시 구체적 수치 인용
- insight는 강점·약점·주목 포인트를 밸런스 있게 작성
- 사업모델 analysis는 특히 상세하게 (6~8문장)`;

  const privatePrompt = `당신은 스타트업/비상장사 재무분석 전문가입니다.
주어진 재무 지표를 바탕으로 분석하세요.

[체크리스트 5개 구분] (반드시 이 순서로):
1. 사업모델 — keyItems: 수익원과 비용구조 / source: 손익계산서
2. 현금 소진 (Burn Rate) — keyItems: Gross/Net Burn Rate, Runway / source: 현금흐름표, 재무상태표
3. 손익 구조 — keyItems: BEP 달성률, 매출총이익률, 매출 성장률 / source: 포괄손익계산서
4. 현금 흐름 건전성 — keyItems: 영업활동현금흐름, 기말 현금잔고 / source: 현금흐름표
5. 리스크 & 기회 — keyItems: 재무 리스크, 성장 가능성 / source: 종합 분석

[카테고리별 점수 기준]:
- 수익성: 매출총이익률과 영업이익률 기준
- 안정성: Runway 기간과 부채비율 기준
- 성장성: 매출 성장률 기준
- 효율성: BEP 달성률과 비용 효율 기준
- 현금창출력: 영업CF와 현금잔고 기준

규칙:
- 한국어, 재무 초보자 눈높이
- 구체적 수치 반드시 인용
- 스타트업 특성 고려 (적자는 성장 단계에서 정상)`;

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
