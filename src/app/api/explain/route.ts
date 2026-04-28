import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import {
  scoreListed,
  scorePrivate,
  calcOverall,
  checklistStatus,
  type CategoryScores,
} from "@/lib/finance/scoring";
import type { ListedMetrics } from "@/lib/finance/metrics/listed";
import type { PrivateMetrics, BurnYoY } from "@/lib/finance/metrics/private";

export const runtime = "nodejs";
// Fluid Compute 기본 허용치 — AI 응답(Gemini + Anthropic fallback + 길어진 insight)으로 60초 초과 가능
export const maxDuration = 300;

/**
 * 체크리스트 분석 API (v5 — 결정론 점수 분리)
 *
 * v4 → v5 변경:
 * - AI 호출 스키마에서 categoryScores, overallScore, checklist[].status 제거
 * - 점수 산정·임계값 매핑은 모두 lib/finance/scoring.ts (결정론)
 * - AI는 summary, insight, checklist[].{category,keyItems,source,analysis}만 생성
 * - 라우트가 metrics → scoring → 응답 조립
 *
 * 왜:
 * - 동일 입력 → 동일 점수 보장 (LLM은 같은 입력에도 점수 흔들림)
 * - 출력 토큰 ↓ → 비용·응답시간 ↓
 * - 임계값 단일 출처 (이전엔 프롬프트 + 라우트 override 두 곳에 중복)
 *
 * 클라이언트는 기존 응답 형식(`{categoryScores, overallScore, checklist[i].status, ...}`)을
 * 그대로 사용하므로 ResultView는 변경 불필요.
 */

// ───────── AI 호출용 스키마 (자연어만) ─────────

const checklistItemAiSchema = z.object({
  category: z
    .string()
    .describe("분석 구분 (예: 사업모델, 매출·이익 흐름 등)"),
  keyItems: z.string().describe("이 구분에서 확인한 핵심 항목 나열"),
  source: z
    .string()
    .describe("데이터 출처 (예: 포괄손익계산서, 재무상태표 등)"),
  analysis: z
    .string()
    .describe(
      "AI의 상세 분석 결과 (최소 5문장, 구체적 수치 인용 필수, 원인·의미·전망 모두 포함)"
    ),
});

const checklistAiSchema = z.object({
  companyName: z.string(),
  summary: z
    .string()
    .describe("이 회사의 재무 상태를 2~3문장으로 핵심 요약"),
  insight: z
    .string()
    .describe(
      "AI 종합 의견: 최소 10문장 이상, 구체적 수치 인용 필수. 한 줄 평가 + 강점 2~3가지 + 약점·리스크 2~3가지 + 동종업계 대비 포지션 + ACTION 제안 3개로 구조화"
    ),
  checklist: z.array(checklistItemAiSchema),
});

type ChecklistAi = z.infer<typeof checklistAiSchema>;

// ───────── 클라이언트 응답 스키마 (점수 포함) ─────────

type ChecklistItem = ChecklistAi["checklist"][number] & {
  status: "good" | "neutral" | "warning";
};

type ChecklistResponse = ChecklistAi & {
  overallScore: number;
  categoryScores: CategoryScores;
  checklist: ChecklistItem[];
};

// ───────── 모델 ─────────

/**
 * explain은 Gemini 우선 사용, Gemini 일시 장애(503) 시 Anthropic 폴백.
 *
 * 왜: analyze에서 Anthropic 토큰 소모 → Gemini로 분산이 기본이지만,
 * Gemini 503(과부하)도 종종 발생하므로 Anthropic을 fallback으로 활용.
 */
function getModels(): {
  primary: LanguageModel | null;
  fallback: LanguageModel | null;
} {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY;

  const primary = geminiKey
    ? createGoogleGenerativeAI({ apiKey: geminiKey })("gemini-2.5-flash")
    : anthropicKey
      ? createAnthropic({ apiKey: anthropicKey })("claude-sonnet-4-6")
      : null;

  const fallback =
    geminiKey && anthropicKey
      ? createAnthropic({ apiKey: anthropicKey })("claude-sonnet-4-6")
      : null;

  return { primary, fallback };
}

// ───────── 비상장 BurnYoY 추정 (라우트 즉석 계산) ─────────

/**
 * AnalysisPanel은 metricsPerYear를 그대로 보낸다.
 * 비상장 metricsPerYear[0]=최신, [1]=전년 형태일 때 Gross Burn Rate를 비교해 BurnYoY 추정.
 *
 * 왜 라우트에서 즉석 계산하나:
 * - calcBurnYoY는 YearData 입력이지만 라우트는 PrivateMetrics만 받음
 * - 굳이 클라에서 BurnYoY를 별도 전송하게 만들기보다, "Gross Burn Rate"는 PrivateMetrics에 이미 있으므로 그것으로 yoy 계산
 * - 데이터 부족이면 null → scorePrivate가 efficiency 50으로 처리 (안전 fallback)
 */
function inferBurnYoY(metrics: PrivateMetrics[]): BurnYoY | null {
  if (metrics.length < 2) return null;
  const latest = metrics[0]?.metrics ?? [];
  const prior = metrics[1]?.metrics ?? [];
  const latestBurn =
    latest.find((m) => m.name === "Gross Burn Rate")?.value ?? null;
  const priorBurn =
    prior.find((m) => m.name === "Gross Burn Rate")?.value ?? null;
  if (latestBurn === null || priorBurn === null || priorBurn === 0) return null;
  const yoy = ((latestBurn - priorBurn) / priorBurn) * 100;
  // netBurn YoY는 음수가 섞여 부호 처리 복잡 → MVP는 grossBurn만 사용
  return { grossBurnYoY: yoy, netBurnYoY: null };
}

// ───────── 프롬프트 (점수 규칙 섹션 제거됨) ─────────

const LISTED_PROMPT = `당신은 한국 상장사 재무분석 전문가입니다.
주어진 재무 지표를 바탕으로 분석하세요.

[체크리스트 5개 구분] (반드시 이 순서로):
1. 사업모델 — keyItems: 수익원(제품·플랫폼·구독 등)과 비용구조 / source: 사업보고서 요약/사업부문 설명
2. 매출·이익 흐름 — keyItems: 최근 3~5년 매출·영업이익·순이익 추이 / source: 포괄손익계산서(손익계산서)
3. 재무건전성 — keyItems: 부채비율, 현금·현금성자산, 이자보상배율 / source: 재무상태표, 현금흐름표
4. 리스크 신호 — keyItems: 자본잠식, 감자·증자·주식소각, 감사의견 / source: 재무상태표, 감사보고서 강조사항
5. 비교·평가 — keyItems: 업종 평균 대비 성장성·수익성·가치지표 / source: 동일 업종 지표 비교

[사업모델 분석 가이드]:
- 이 기업이 어떤 제품/서비스로 돈을 버는지 추정
- 매출원가율로 제조업/서비스업/플랫폼 등 비즈니스 유형 판단
- 매출 규모와 성장 추세로 시장 내 위치 추정
- 주요 비용 구조(원가 vs 판관비 비중)로 사업 특성 파악
- analysis를 6~8문장으로 상세하게 작성

[analysis & insight 작성 규칙 — 매우 중요]:
- 각 카테고리 analysis는 **최소 5문장 이상**, 구체적 수치 인용 필수
- "부채비율이 높다"가 아니라 "부채비율 180% — 업종 평균(120%) 대비 50%p 높음 → …"
- 원인 + 의미 + 향후 전망(개선/악화 가능성) 모두 포함
- insight는 **10문장 이상**, 다음 구조로:
  · 한 줄 재무 평가
  · 강점 2~3가지 (수치 인용)
  · 약점·리스크 2~3가지 (수치 인용)
  · 동종업계 대비 포지션 1~2문장
  · ACTION 제안 3개 (구체 숫자 목표)
- 사업모델 analysis는 특히 상세하게 (6~8문장, 비즈니스 유형 추정 포함)

규칙:
- 한국어, 재무 초보자도 이해 가능하되 재무 용어는 그대로 (ROE, EBITDA 등)
- 짧은 요약은 금지 — 한솔 사용자는 KICPA·VC 경력자로 깊이 있는 분석을 기대
- 점수·합계는 시스템이 별도 계산하므로 산정하지 말 것 (텍스트 분석에만 집중)`;

const PRIVATE_PROMPT = `당신은 스타트업 투자 심사를 15년 이상 해온 시니어 VC 심사역입니다.
상장사 기준의 "이익률·ROE"가 아니라, 스타트업 관점에서 "현금·Runway·생존성·성장 효율"을 판단합니다.
이 회사가 당신이 검토 중인 Series A~C 투자 건이라고 가정하고, 실사 메모를 작성하는 톤으로 분석하세요.

[체크리스트 5개 구분] (반드시 이 순서로):
1. 사업모델 — keyItems: 매출 구성·비용 구조·비즈니스 타입(플랫폼/제조/서비스) / source: 손익계산서
2. 현금 소진 (Burn Rate) — keyItems: Gross/Net Burn, Runway, 전년 대비 Burn 증감 / source: 현금흐름표
3. 손익 구조 & 성장 — keyItems: BEP 달성률, 매출 성장률, 매출총이익률 / source: 포괄손익계산서
4. 자본·차입 구조 — keyItems: 자본잠식 여부, 부채비율, 현금 vs 차입 비중 / source: 재무상태표
5. 리스크 & 투자 포인트 — keyItems: 생존 리스크·성장 레버·투자 결정 요인 / source: 종합

[analysis 작성 규칙 — 매우 중요]:
- 각 카테고리의 analysis는 **최소 5문장 이상**, 구체적 숫자 인용 필수
- "Runway가 짧다"가 아니라 "Runway 8개월 (기말 현금 X억 / 월 Net Burn Y억)"
- 스타트업 특성 고려 (적자는 성장 단계에서 정상이지만 Burn 통제력은 평가)
- VC가 실제로 던질 질문("왜 이 분기부터 CAC가 급증했나?" 같은 뉘앙스)을 녹여 작성

[insight — 10~15문장 이상, VC 실사 메모 수준]:
반드시 다음 구조로 작성:
  · 한 줄 투자 의견 (긍정/중립/부정 + 근거)
  · 핵심 강점 2~3가지 (수치 인용)
  · 핵심 리스크 2~3가지 (수치 인용)
  · VC가 실사 때 꼭 물어볼 핵심 질문 3개 (예: "Runway 연장을 위한 구체 계획은?", "BEP 시점 예측은?")
  · 다음 라운드 투자 관점에서의 ACTION 제안 3개 (구체적 숫자 목표 포함)

규칙:
- 한국어, 재무·VC 용어는 그대로 사용 (ARR, MRR, Runway, Burn, BEP 등)
- insight는 반드시 10문장 이상 — 짧은 요약은 금지
- 모든 판단 뒤에 "왜" 설명
- 점수·합계는 시스템이 별도 계산하므로 산정하지 말 것 (텍스트 분석에만 집중)`;

// ───────── 라우트 본문 ─────────

export async function POST(request: Request) {
  const { primary, fallback } = getModels();
  if (!primary) {
    return Response.json(
      { error: "AI API 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const { metrics, companyName, type } = await request.json();
  const typeLabel = type === "listed" ? "상장사" : "비상장 스타트업";
  const systemPrompt = type === "listed" ? LISTED_PROMPT : PRIVATE_PROMPT;

  const generateArgs = {
    // AI SDK 기본 retry(2회)는 Gemini 503 5초 backoff × 2회 = 30~60초 지연.
    // 실측상 503은 retry해도 같은 시점엔 또 503 → 빨리 Anthropic 폴백 발동시킴.
    maxRetries: 1,
    schema: checklistAiSchema,
    system: systemPrompt,
    prompt: `기업명: ${companyName}
분석 유형: ${typeLabel}

재무 지표:
${JSON.stringify(metrics, null, 2)}`,
  };

  // ── AI 호출 (자연어만) ──
  let aiObject: ChecklistAi;
  try {
    try {
      const res = await generateObject({ model: primary, ...generateArgs });
      aiObject = res.object;
    } catch (primaryErr) {
      console.warn(
        "[explain] primary 실패:",
        (primaryErr as Error).message ?? primaryErr
      );
      if (!fallback) throw primaryErr;
      console.log("[explain] Anthropic fallback 시도");
      const res = await generateObject({ model: fallback, ...generateArgs });
      aiObject = res.object;
    }
  } catch (error) {
    console.error("Explain error:", error);
    const msg = (error as Error).message ?? "";
    const friendly =
      msg.includes("high demand") || msg.includes("UNAVAILABLE")
        ? "AI 서비스가 일시적으로 과부하 상태입니다. 1~2분 후 다시 시도해주세요."
        : "AI 분석에 실패했습니다.";
    return Response.json({ error: friendly, detail: msg }, { status: 500 });
  }

  // ── 결정론 점수 계산 ──
  const categoryScores: CategoryScores =
    type === "listed"
      ? scoreListed(metrics as ListedMetrics[])
      : scorePrivate(
          metrics as PrivateMetrics[],
          inferBurnYoY(metrics as PrivateMetrics[])
        );

  const overallScore = calcOverall(categoryScores, type);

  const enrichedChecklist = aiObject.checklist.map((item) => ({
    ...item,
    status: checklistStatus(item.category, categoryScores, type),
  }));

  const response: ChecklistResponse = {
    ...aiObject,
    overallScore,
    categoryScores,
    checklist: enrichedChecklist,
  };

  return Response.json(response);
}
