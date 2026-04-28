import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import {
  financialDataSchema,
  type FinancialData,
  type YearData,
} from "../finance/types";
import type { LanguageModel } from "ai";

// 스캔/이미지 PDF 감지 임계값 — 텍스트가 이 길이 미만이면 Vision(OCR) 경로로 분기
const MIN_TEXT_LENGTH_FOR_ANALYSIS = 500;

/**
 * AI SDK retry 횟수.
 *
 * 왜 1로 줄였나:
 * - AI SDK 기본값은 2회 — 503 후 5초 backoff × 2회 = 30~60초 까먹음
 * - Gemini "high demand"는 retry해도 같은 시점엔 또 503으로 떨어지는 패턴이 실측됨
 * - 빨리 폴백(Anthropic) 발동시키는 게 사용자 체감에 훨씬 유리
 * - 실제 네트워크 일시 깜빡임 회복력은 1회 retry로 충분
 */
const AI_MAX_RETRIES = 1;

/**
 * Vision(OCR) 경로 전용 슬림 스키마.
 *
 * 왜 슬림하게 만드는가:
 * - financialDataSchema는 nullable union이 19개 → Anthropic 한도(16) 초과로 invalid_request 즉사.
 * - Gemini가 503 일시 장애일 때 Anthropic 폴백이 영구 차단되는 문제 차단.
 * - Vision OCR로 핵심 14개만 추출하고, 나머지는 매핑 시 null로 채움.
 *
 * 제외 항목 (스캔본은 어차피 정밀도 낮음 + 비상장 점수에 필수 아님):
 *   interestExpense, depreciation, restrictedCash, operatingExpenses
 *   stockCode (Vision 대상은 비상장 스캔본 가정 → 항상 null)
 *   peerSuggestions (스캔본에서 동종업체 추천은 무리 → 빈 배열)
 */
const visionYearSchema = z.object({
  year: z.string().describe("회계연도 (예: '2024')"),
  revenue: z.number().nullable().describe("매출액"),
  costOfGoodsSold: z.number().nullable().describe("매출원가"),
  grossProfit: z.number().nullable().describe("매출총이익"),
  operatingProfit: z.number().nullable().describe("영업이익"),
  netIncome: z.number().nullable().describe("당기순이익"),
  totalAssets: z.number().nullable().describe("자산총계"),
  currentAssets: z.number().nullable().describe("유동자산"),
  inventory: z.number().nullable().describe("재고자산"),
  totalLiabilities: z.number().nullable().describe("부채총계"),
  currentLiabilities: z.number().nullable().describe("유동부채"),
  totalEquity: z.number().nullable().describe("자본총계"),
  cashBalance: z.number().nullable().describe("현금 및 현금성자산 (기말)"),
  operatingCashFlow: z.number().nullable().describe("영업활동 현금흐름"),
  sgaExpenses: z.number().nullable().describe("판매비와관리비"),
});

const visionFinancialSchema = z.object({
  companyName: z.string().describe("기업명"),
  years: z.array(visionYearSchema).min(1).describe("연도별 재무 데이터"),
});

type VisionYear = z.infer<typeof visionYearSchema>;

/** Vision 슬림 결과 → 전체 FinancialData 형태로 변환. 누락 필드는 null. */
function visionToFinancialData(
  vision: z.infer<typeof visionFinancialSchema>
): FinancialData {
  const years: YearData[] = vision.years.map((y: VisionYear) => ({
    year: y.year,
    revenue: y.revenue,
    costOfGoodsSold: y.costOfGoodsSold,
    grossProfit: y.grossProfit,
    operatingProfit: y.operatingProfit,
    netIncome: y.netIncome,
    interestExpense: null,
    depreciation: null,
    totalAssets: y.totalAssets,
    currentAssets: y.currentAssets,
    inventory: y.inventory,
    totalLiabilities: y.totalLiabilities,
    currentLiabilities: y.currentLiabilities,
    totalEquity: y.totalEquity,
    restrictedCash: null,
    operatingCashFlow: y.operatingCashFlow,
    cashBalance: y.cashBalance,
    operatingExpenses:
      y.costOfGoodsSold !== null && y.sgaExpenses !== null
        ? y.costOfGoodsSold + y.sgaExpenses
        : null,
    sgaExpenses: y.sgaExpenses,
  }));

  return {
    companyName: vision.companyName,
    stockCode: null,
    peerSuggestions: [],
    years,
  };
}

/**
 * 일시 장애·스키마 한도·토큰 한도 같은 환경 문제는 ScannedPdfError로 wrap하지 않는다.
 * (원본 에러 메시지를 그대로 보여줘야 사용자/개발자가 진짜 원인을 안다.)
 */
function isEnvironmentalError(message: string): boolean {
  return /high demand|UNAVAILABLE|rate.?limit|429|503|too many parameters|context length|token (limit|exceed)/i.test(
    message
  );
}

/**
 * 스캔본/이미지 PDF도 분석할 수 있도록, AI에 PDF를 직접 전송(멀티모달)하여
 * 모델이 내장 OCR로 텍스트를 읽고 바로 구조화 데이터를 반환하도록 한다.
 *
 * 조건부로 유지하는 에러 타입 — Vision 경로조차 실패할 때 화면 안내용.
 */
export class ScannedPdfError extends Error {
  constructor(reason: string) {
    super(
      `이미지·스캔 PDF의 OCR 처리에 실패했습니다 (${reason}). 해상도가 낮거나 손상된 PDF일 수 있습니다.`
    );
    this.name = "ScannedPdfError";
  }
}

/**
 * PDF에서 재무 데이터를 AI로 추출한다.
 *
 * 구조: PDF 전체 텍스트 → 1회 generateObject 호출 → 통합 스키마 결과 반환.
 * 텍스트 자르기/구간 추출 없이 전체를 그대로 AI에게 전달 (Gemini Tier 1 토큰 한도 충분).
 */

/**
 * primary(Gemini) + fallback(Anthropic) 두 모델 반환.
 * Gemini 503 / rate limit 시 자동 폴백.
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

const EXTRACTION_PROMPT = `이 텍스트는 한국 기업의 사업보고서/감사보고서 전체입니다.
다음 항목을 추출해주세요.

[기업 정보]
- companyName: 기업명
- stockCode: 6자리 종목코드 (예: '005930'). KOSPI/KOSDAQ 상장사만. 비상장사면 null.
- peerSuggestions: 이 기업과 동종업종(같은 산업/사업영역)의 한국 상장사 3개 추천.
  반드시 지킬 것:
    · 한국 상장사만 (해외 회사 절대 제외 — Apple, Intel, Sony 등 X)
    · 시가총액 비슷한 수준 (대기업이면 대기업, 중견이면 중견)
    · 본 회사 자체는 제외
    · 각 항목은 { name: 회사명, code: 6자리 종목코드 }
    · 비상장사 분석이면 빈 배열 [] 반환

[손익계산서] 매출액, 매출원가, 매출총이익, 영업이익, 당기순이익, 이자비용, 감가상각비
[재무상태표] 자산총계, 유동자산, 재고자산, 부채총계, 유동부채, 자본총계, 사용제한 현금
  - 사용제한 현금은 "사용제한예금", "담보제공예금", "장기금융상품(사용제한)" 등의 표기. 없으면 null.
[현금흐름표] 영업활동현금흐름, 기말현금
[기타] 판매비와관리비, 영업비용(판관비+매출원가)

규칙:
- 금액은 반드시 "원" 단위로 통일 (백만원이면 ×1,000,000, 천원이면 ×1,000)
- 최근 2~3개년 데이터 추출 (최신 연도 먼저)
- 찾을 수 없는 항목은 null
- 비용 항목(매출원가, 판관비 등)은 양수로 기입
- 목차/요약이 아닌 실제 재무제표 표 본문에서 숫자를 추출`;

export async function extractFinancialDataFromPDF(
  pdfBuffer: Buffer
): Promise<FinancialData> {
  const { primary, fallback } = getModels();
  if (!primary) {
    throw new Error(
      "AI API 키가 설정되지 않았습니다. .env.local에 ANTHROPIC_API_KEY 또는 GEMINI_API_KEY를 추가해주세요."
    );
  }

  const fullText = await extractTextFromPdfBuffer(pdfBuffer);

  // 텍스트 레이어가 충분하면 기존 텍스트 기반 경로 (빠름·저렴)
  if (fullText.trim().length >= MIN_TEXT_LENGTH_FOR_ANALYSIS) {
    console.log(`PDF 텍스트 ${fullText.length}자 → 텍스트 기반 AI 호출`);
    return await withFallback(primary, fallback, (model) =>
      generateObject({
        model,
        maxRetries: AI_MAX_RETRIES,
        schema: financialDataSchema,
        prompt: `${EXTRACTION_PROMPT}\n\n---\n${fullText}`,
      })
    );
  }

  // 스캔본/이미지 PDF → Vision 경로 (AI가 PDF 파일 자체를 OCR)
  // 슬림 스키마(visionFinancialSchema)를 사용해 Anthropic 한도(16 union) 회피.
  console.log(
    `PDF 텍스트 ${fullText.trim().length}자만 추출됨 → Vision(OCR) 슬림 스키마 경로`
  );
  const visionPrompt = `이 PDF는 한국 비상장사의 감사보고서/재무제표(스캔본 가능)입니다. PDF 페이지를 OCR하여 다음을 추출하세요.

[기업 정보]
- companyName: 기업명 (정확히 한글 표기, "(주)" 포함 가능)

[연도별 재무 (years 배열)]
- 최근 2~3개년 데이터, 각 연도별로 다음 항목 추출
- year: 회계연도 (예: '2024')
- 손익계산서: revenue(매출액), costOfGoodsSold(매출원가), grossProfit(매출총이익), operatingProfit(영업이익), netIncome(당기순이익), sgaExpenses(판매비와관리비)
- 재무상태표: totalAssets(자산총계), currentAssets(유동자산), inventory(재고자산), totalLiabilities(부채총계), currentLiabilities(유동부채), totalEquity(자본총계), cashBalance(현금 및 현금성자산)
- 현금흐름표: operatingCashFlow(영업활동 현금흐름)

규칙:
- 금액은 반드시 "원" 단위로 통일 (백만원이면 ×1,000,000, 천원이면 ×1,000)
- 비용 항목(매출원가, 판관비)은 양수로 기입
- 찾을 수 없는 항목은 null
- 최신 연도 먼저`;

  try {
    const visionData = await withFallback(primary, fallback, (model) =>
      generateObject({
        model,
        maxRetries: AI_MAX_RETRIES,
        schema: visionFinancialSchema,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: visionPrompt },
              {
                type: "file",
                data: pdfBuffer,
                mediaType: "application/pdf",
              },
            ],
          },
        ],
      })
    );
    return visionToFinancialData(visionData);
  } catch (err) {
    const msg = (err as Error).message ?? "알 수 없는 오류";
    // rate-limit, 토큰 한도, 503 같은 환경 에러는 OCR 실패가 아니므로 원본 그대로 throw
    if (isEnvironmentalError(msg)) throw err;
    throw new ScannedPdfError(msg);
  }
}

/**
 * primary → fallback 순으로 generateObject 시도 (generic).
 */
async function withFallback<T>(
  primary: LanguageModel,
  fallback: LanguageModel | null,
  call: (model: LanguageModel) => Promise<{ object: T }>
): Promise<T> {
  try {
    const { object } = await call(primary);
    return object;
  } catch (primaryErr) {
    console.warn(
      "[extract] primary 실패:",
      (primaryErr as Error).message ?? primaryErr
    );
    if (!fallback) throw primaryErr;
    console.log("[extract] fallback(Anthropic) 시도");
    const { object } = await call(fallback);
    return object;
  }
}

/**
 * PDF 전체 텍스트를 추출한다.
 */
async function extractTextFromPdfBuffer(
  pdfBuffer: Buffer
): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(pdfBuffer));

  let fullText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    type TextItem = { str: string; x: number; y: number; width: number };
    const items: TextItem[] = [];
    for (const item of content.items) {
      if ("str" in item && item.str && "transform" in item) {
        const transform = item.transform as number[];
        items.push({
          str: item.str,
          x: transform[4],
          y: Math.round(transform[5]),
          width: item.width as number,
        });
      }
    }
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    let lastY = items[0]?.y ?? 0;
    let lastEndX = 0;
    for (const item of items) {
      const yDiff = Math.abs(item.y - lastY);
      if (yDiff > 2) {
        fullText += "\n";
        lastEndX = 0;
      } else if (item.x - lastEndX > 15) {
        fullText += "\t";
      }
      fullText += item.str;
      lastY = item.y;
      lastEndX = item.x + (item.width || 0);
    }
    fullText += "\n";
  }

  console.log(`PDF 전체 텍스트: ${fullText.length}자, ${doc.numPages}페이지`);
  return fullText;
}
