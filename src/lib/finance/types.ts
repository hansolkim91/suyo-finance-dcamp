import { z } from "zod";

/**
 * 재무제표에서 추출할 핵심 항목 (단위: 원)
 *
 * 단일 통합 스키마: PDF 전체 텍스트를 1회 generateObject 호출로 추출.
 * UI와 추출 호출 모두 이 스키마 1개만 사용한다.
 */

export const yearDataSchema = z.object({
  year: z.string().describe("회계연도 (예: '2024')"),

  // === 손익계산서 ===
  revenue: z.number().nullable().describe("매출액"),
  costOfGoodsSold: z.number().nullable().describe("매출원가"),
  grossProfit: z.number().nullable().describe("매출총이익"),
  operatingProfit: z.number().nullable().describe("영업이익"),
  netIncome: z.number().nullable().describe("당기순이익"),
  interestExpense: z.number().nullable().describe("이자비용"),
  depreciation: z.number().nullable().describe("감가상각비 (유무형 합산)"),

  // === 재무상태표 ===
  totalAssets: z.number().nullable().describe("자산총계"),
  currentAssets: z.number().nullable().describe("유동자산"),
  inventory: z.number().nullable().describe("재고자산 (당좌비율 계산용)"),
  totalLiabilities: z.number().nullable().describe("부채총계"),
  currentLiabilities: z.number().nullable().describe("유동부채"),
  totalEquity: z.number().nullable().describe("자본총계"),
  restrictedCash: z
    .number()
    .nullable()
    .describe(
      "사용제한 현금 (담보예금, 장기금융상품 중 사용제한분 등). 없으면 null."
    ),

  // === 현금흐름표 + 비상장 보조 ===
  operatingCashFlow: z.number().nullable().describe("영업활동 현금흐름"),
  cashBalance: z.number().nullable().describe("현금 및 현금성자산 (기말)"),
  operatingExpenses: z
    .number()
    .nullable()
    .describe("영업비용 (판관비+매출원가 합산, 비상장 Burn 계산용)"),
  sgaExpenses: z.number().nullable().describe("판매비와관리비"),
});

export type YearData = z.infer<typeof yearDataSchema>;

// === v4 신규: AI가 추천하는 동종업체 ===
export const peerSuggestionSchema = z.object({
  name: z.string().describe("동종업종 회사명 (한국 상장사)"),
  code: z.string().describe("6자리 종목코드 (예: '005930')"),
});

export type PeerSuggestion = z.infer<typeof peerSuggestionSchema>;

export const financialDataSchema = z.object({
  companyName: z.string().describe("기업명"),
  stockCode: z
    .string()
    .nullable()
    .describe("6자리 종목코드 (KOSPI/KOSDAQ). 비상장사면 null."),
  peerSuggestions: z
    .array(peerSuggestionSchema)
    .describe(
      "동종업종 한국 상장사 추천 (3개 권장). 시가총액 비슷한 수준. 비상장사면 빈 배열."
    ),
  years: z.array(yearDataSchema).min(1).describe("연도별 재무 데이터"),
});

export type FinancialData = z.infer<typeof financialDataSchema>;
