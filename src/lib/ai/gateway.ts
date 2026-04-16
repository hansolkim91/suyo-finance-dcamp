import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { financialDataSchema, type FinancialData } from "../finance/types";
import type { LanguageModel } from "ai";

/**
 * PDF에서 재무 데이터를 AI로 추출한다.
 *
 * 전략:
 * - 작은 PDF (4.5MB 이하): PDF 파일을 AI에 직접 전달 (가장 정확)
 * - 큰 PDF (4.5MB 초과): 텍스트 추출 후 앞 30,000자만 전달 (토큰 한도 대응)
 *
 * 왜 4.5MB 기준인가:
 * - Claude의 토큰 한도는 약 100만. PDF 1MB ≈ 약 30만 토큰
 * - 4.5MB면 약 135만 토큰으로 한도 초과 → 텍스트 모드로 전환
 */

function getModel(): LanguageModel {
  // 1순위: Anthropic Claude (유료 결제 후 한도 충분)
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic("claude-sonnet-4-6");
  }

  // 2순위: Gemini (폴백)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    return google("gemini-2.5-flash");
  }

  throw new Error(
    "AI API 키가 설정되지 않았습니다. .env.local에 ANTHROPIC_API_KEY 또는 GEMINI_API_KEY를 추가해주세요."
  );
}

const EXTRACTION_PROMPT = `이 PDF(또는 텍스트)는 한국 기업의 재무제표(사업보고서/감사보고서)입니다.
손익계산서, 재무상태표, 현금흐름표에서 재무 항목을 추출해주세요.

추출 대상:
[손익계산서] 매출액, 매출원가, 매출총이익, 영업이익, 당기순이익, 이자비용, 감가상각비
[재무상태표] 자산총계, 유동자산, 부채총계, 유동부채, 자본총계
[현금흐름표] 영업활동현금흐름, 기말현금
[기타] 판매비와관리비, 영업비용(판관비+매출원가)

규칙:
- 금액은 반드시 "원" 단위로 통일 (백만원이면 ×1,000,000, 천원이면 ×1,000)
- 최근 2~3개년 데이터 추출 (최신 연도 먼저)
- 찾을 수 없는 항목은 null
- 비용 항목(매출원가, 판관비 등)은 양수로 기입`;


export async function extractFinancialDataFromPDF(
  pdfBuffer: Buffer
): Promise<FinancialData> {
  const model = getModel();

  // PDF에서 전체 텍스트 추출 후 재무제표 구간만 발췌
  const fullText = await extractTextFromPdfBuffer(pdfBuffer);
  const financialText = findFinancialSection(fullText);

  console.log(
    `전체 ${fullText.length}자 → 재무 구간 ${financialText.length}자 전달`
  );

  const { object } = await generateObject({
    model,
    schema: financialDataSchema,
    prompt: `${EXTRACTION_PROMPT}\n\n---\n${financialText}`,
  });
  return object;
}

/**
 * 전체 텍스트에서 재무제표가 있는 구간을 찾아 60,000자를 반환한다.
 *
 * DART 사업보고서 구조:
 * - 앞부분: 목차 → 회사개요 → 사업내용 (재무 숫자 없음)
 * - 중간~뒷부분: "III. 재무에 관한 사항" → 실제 재무제표
 *
 * 60,000자 ≈ 30,000 토큰 — Gemini 무료 한도(25만/분)에 여유 있음
 */
function findFinancialSection(fullText: string): string {
  const MAX_CHARS = 60000;

  // 재무제표 시작 마커 (DART 표준 구조)
  const markers = [
    "재 무 에 관 한 사 항",
    "재무에 관한 사항",
    "재무에관한사항",
    "연 결 재 무 제 표",
    "연결재무제표",
    "연결 재무제표",
    "포 괄 손 익 계 산 서",
    "포괄손익계산서",
  ];

  for (const marker of markers) {
    const idx = fullText.indexOf(marker);
    if (idx !== -1) {
      console.log(`재무 구간 마커 발견: "${marker}" (위치: ${idx}/${fullText.length})`);
      return fullText.slice(idx, idx + MAX_CHARS);
    }
  }

  // 마커를 못 찾으면 뒤쪽 40%부터 (재무표는 보통 뒷부분에 위치)
  const startIdx = Math.floor(fullText.length * 0.4);
  console.log(`재무 마커 없음 → 텍스트 40% 지점(${startIdx})부터 사용`);
  return fullText.slice(startIdx, startIdx + MAX_CHARS);
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
