import { z } from "zod";

/**
 * 재무제표에서 추출할 핵심 항목 (단위: 원)
 *
 * Claude의 구조화 출력은 nullable 필드가 최대 16개까지 허용됨.
 * 지표 계산에 실제로 사용되는 필드만 포함 (16개).
 */

export const yearDataSchema = z.object({
  year: z.string().describe("회계연도 (예: '2024')"),

  // === 손익계산서 (7개) ===
  revenue: z.number().nullable().describe("매출액"),
  costOfGoodsSold: z.number().nullable().describe("매출원가"),
  grossProfit: z.number().nullable().describe("매출총이익"),
  operatingProfit: z.number().nullable().describe("영업이익"),
  netIncome: z.number().nullable().describe("당기순이익"),
  interestExpense: z.number().nullable().describe("이자비용"),
  depreciation: z.number().nullable().describe("감가상각비 (유무형 합산)"),

  // === 재무상태표 (5개) ===
  totalAssets: z.number().nullable().describe("자산총계"),
  currentAssets: z.number().nullable().describe("유동자산"),
  totalLiabilities: z.number().nullable().describe("부채총계"),
  currentLiabilities: z.number().nullable().describe("유동부채"),
  totalEquity: z.number().nullable().describe("자본총계"),

  // === 현금흐름표 + 비상장용 (4개) ===
  operatingCashFlow: z.number().nullable().describe("영업활동 현금흐름"),
  cashBalance: z.number().nullable().describe("현금 및 현금성자산 (기말)"),
  operatingExpenses: z
    .number()
    .nullable()
    .describe("영업비용 (판관비+매출원가 합산, 비상장용)"),
  sgaExpenses: z.number().nullable().describe("판매비와관리비"),
});

export type YearData = z.infer<typeof yearDataSchema>;

export const financialDataSchema = z.object({
  companyName: z.string().describe("기업명"),
  years: z.array(yearDataSchema).min(1).describe("연도별 재무 데이터"),
});

export type FinancialData = z.infer<typeof financialDataSchema>;
