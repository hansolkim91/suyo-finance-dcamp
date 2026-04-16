import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { financialDataSchema, type FinancialData } from "../finance/types";
import type { LanguageModel } from "ai";

/**
 * PDF에서 재무 데이터를 AI로 추출한다.
 *
 * 전략 (v3):
 * - PDF 전체 텍스트에서 재무제표 3대 구간을 각각 찾아서 합침
 *   (손익계산서 + 재무상태표 + 현금흐름표)
 * - 이전 v1은 마커 1개만 찾아 60,000자 → 일부 재무표 누락
 * - v2는 전체 전달 → API 토큰 한도 초과
 * - v3은 3개 구간을 각각 찾아 합쳐서 ~150,000자 이내로 전달
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

const EXTRACTION_PROMPT = `이 텍스트는 한국 기업의 재무제표(사업보고서/감사보고서)에서 추출한 핵심 구간입니다.
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

  const fullText = await extractTextFromPdfBuffer(pdfBuffer);
  const financialText = extractFinancialSections(fullText);

  console.log(
    `전체 ${fullText.length}자 → 재무 핵심 ${financialText.length}자 전달`
  );

  const { object } = await generateObject({
    model,
    schema: financialDataSchema,
    prompt: `${EXTRACTION_PROMPT}\n\n---\n${financialText}`,
  });
  return object;
}

/**
 * PDF 전체 텍스트에서 재무제표 3대 구간을 각각 찾아 합친다.
 *
 * 왜 3개 구간을 따로 찾는가:
 * - DART 사업보고서에서 손익계산서, 재무상태표, 현금흐름표는
 *   각각 다른 위치에 있을 수 있음
 * - 마커 1개만 찾으면 뒤쪽 재무표가 잘릴 수 있음
 * - 3개 구간을 각각 찾아서 합치면 누락 없이 모든 재무 데이터 확보
 *
 * 각 구간당 최대 40,000자 × 3 = 최대 120,000자 ≈ 60,000 토큰
 * → Gemini 무료 한도(250,000 토큰/분) 이내
 */
function extractFinancialSections(fullText: string): string {
  const SECTION_SIZE = 40000;
  const sections: string[] = [];
  const usedRanges: [number, number][] = [];

  // 3대 재무제표 마커 그룹
  const markerGroups = [
    {
      name: "손익계산서",
      markers: [
        "포 괄 손 익 계 산 서",
        "포괄손익계산서",
        "손 익 계 산 서",
        "손익계산서",
      ],
    },
    {
      name: "재무상태표",
      markers: [
        "재 무 상 태 표",
        "재무상태표",
        "연 결 재 무 상 태 표",
        "연결재무상태표",
      ],
    },
    {
      name: "현금흐름표",
      markers: [
        "현 금 흐 름 표",
        "현금흐름표",
        "연 결 현 금 흐 름 표",
        "연결현금흐름표",
      ],
    },
  ];

  // "재무에 관한 사항" 전체 구간도 폴백으로 사용
  const overallMarkers = [
    "재 무 에 관 한 사 항",
    "재무에 관한 사항",
    "재무에관한사항",
  ];

  for (const group of markerGroups) {
    let found = false;
    for (const marker of group.markers) {
      const idx = fullText.indexOf(marker);
      if (idx !== -1 && !isOverlapping(idx, idx + SECTION_SIZE, usedRanges)) {
        const end = Math.min(idx + SECTION_SIZE, fullText.length);
        sections.push(
          `\n=== ${group.name} 구간 ===\n${fullText.slice(idx, end)}`
        );
        usedRanges.push([idx, end]);
        console.log(
          `${group.name} 마커 발견: "${marker}" (위치: ${idx}/${fullText.length})`
        );
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`${group.name} 마커 없음`);
    }
  }

  // 아무 구간도 못 찾았으면 "재무에 관한 사항"부터 큰 구간으로
  if (sections.length === 0) {
    for (const marker of overallMarkers) {
      const idx = fullText.indexOf(marker);
      if (idx !== -1) {
        const bigSize = Math.min(120000, fullText.length - idx);
        sections.push(fullText.slice(idx, idx + bigSize));
        console.log(
          `전체 재무 마커로 폴백: "${marker}" (위치: ${idx}, ${bigSize}자)`
        );
        break;
      }
    }
  }

  // 그래도 못 찾으면 뒤쪽 40%부터
  if (sections.length === 0) {
    const startIdx = Math.floor(fullText.length * 0.4);
    const fallbackSize = Math.min(120000, fullText.length - startIdx);
    sections.push(fullText.slice(startIdx, startIdx + fallbackSize));
    console.log(
      `재무 마커 전혀 없음 → 텍스트 40% 지점(${startIdx})부터 ${fallbackSize}자 사용`
    );
  }

  return sections.join("\n\n");
}

function isOverlapping(
  start: number,
  end: number,
  ranges: [number, number][]
): boolean {
  for (const [rStart, rEnd] of ranges) {
    if (start < rEnd && end > rStart) return true;
  }
  return false;
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
