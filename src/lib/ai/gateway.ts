import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { financialDataSchema, type FinancialData } from "../finance/types";
import type { LanguageModel } from "ai";

/**
 * PDF에서 재무 데이터를 AI로 추출한다.
 *
 * 구조: PDF 전체 텍스트 → 1회 generateObject 호출 → 통합 스키마 결과 반환.
 * 텍스트 자르기/구간 추출 없이 전체를 그대로 AI에게 전달 (Gemini Tier 1 토큰 한도 충분).
 */

function getModel(): LanguageModel {
  // 1순위: Gemini (대용량 입력 지원)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    return google("gemini-2.5-flash");
  }

  // 2순위: Anthropic Claude (폴백)
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic("claude-sonnet-4-6");
  }

  throw new Error(
    "AI API 키가 설정되지 않았습니다. .env.local에 ANTHROPIC_API_KEY 또는 GEMINI_API_KEY를 추가해주세요."
  );
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
  const model = getModel();

  const fullText = await extractTextFromPdfBuffer(pdfBuffer);

  console.log(`PDF 전체 ${fullText.length}자 → AI 1회 호출`);

  const { object } = await generateObject({
    model,
    schema: financialDataSchema,
    prompt: `${EXTRACTION_PROMPT}\n\n---\n${fullText}`,
  });
  return object;
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
