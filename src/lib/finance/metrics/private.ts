import type { FinancialData } from "../types";

/**
 * 비상장(스타트업) 재무 지표를 3개 카테고리, 9개 항목으로 계산한다.
 *
 * 카테고리 구분:
 * - 현금 소진: 돈을 얼마나 빨리 쓰고 있는지 (생존의 핵심)
 * - 손익 구조: 수익과 비용의 균형
 * - 현금 흐름: 실제 현금이 어떻게 움직이는지
 */

export type PrivateMetric = {
  name: string;
  value: number | null;
  unit: string;
  description: string;
  category: "현금 소진" | "손익 구조" | "현금 흐름";
};

export type PrivateMetrics = {
  year: string;
  metrics: PrivateMetric[];
};

// ──────────────────── 현금 소진 지표 ────────────────────

// Gross Burn Rate = 월 총 영업비용
function grossBurn(operatingExpenses: number | null): number | null {
  if (operatingExpenses === null) return null;
  return Math.abs(operatingExpenses) / 12;
}

// Net Burn Rate = 월 순 현금 소진액
function netBurn(
  operatingExpenses: number | null,
  revenue: number | null
): number | null {
  if (operatingExpenses === null) return null;
  const expenses = Math.abs(operatingExpenses);
  const rev = revenue ?? 0;
  const burn = expenses - rev;
  return burn > 0 ? burn / 12 : -(Math.abs(burn) / 12);
}

// Runway = 현금잔고 / Net Burn Rate (개월)
function runway(
  cashBalance: number | null,
  monthlyNetBurn: number | null
): number | null {
  if (cashBalance === null || monthlyNetBurn === null) return null;
  if (monthlyNetBurn <= 0) return 999; // 흑자 → 무한
  return cashBalance / monthlyNetBurn;
}

// ──────────────────── 손익 구조 지표 ────────────────────

// BEP 달성률 = 매출 / 영업비용 × 100
function bepRatio(
  revenue: number | null,
  operatingExpenses: number | null
): number | null {
  if (revenue === null || operatingExpenses === null) return null;
  const expenses = Math.abs(operatingExpenses);
  if (expenses === 0) return null;
  return (revenue / expenses) * 100;
}

// 매출총이익률 = (매출 - 매출원가) / 매출 × 100
function grossMargin(
  grossProfit: number | null,
  revenue: number | null
): number | null {
  if (grossProfit === null || revenue === null || revenue === 0) return null;
  return (grossProfit / revenue) * 100;
}

// 영업이익률 = 영업이익 / 매출 × 100
function operatingMargin(
  operatingProfit: number | null,
  revenue: number | null
): number | null {
  if (operatingProfit === null || revenue === null || revenue === 0) return null;
  return (operatingProfit / revenue) * 100;
}

// YoY 매출 성장률
function yoyGrowth(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * 비상장사 재무 데이터로 9개 지표를 카테고리별로 계산.
 */
export function calculatePrivateMetrics(
  data: FinancialData
): PrivateMetrics[] {
  return data.years.map((yearData, index) => {
    const prevYear = data.years[index + 1] ?? null;
    const monthlyNetBurn = netBurn(
      yearData.operatingExpenses,
      yearData.revenue
    );

    const metrics: PrivateMetric[] = [
      // ── 현금 소진 (3개) ──
      {
        name: "Gross Burn Rate",
        value: grossBurn(yearData.operatingExpenses),
        unit: "원/월",
        description:
          "매달 나가는 총 비용. 매출과 관계없이 운영에 필요한 돈입니다.",
        category: "현금 소진",
      },
      {
        name: "Net Burn Rate",
        value: monthlyNetBurn,
        unit: "원/월",
        description:
          "매출을 뺀 실제 현금 소진 속도. 음수면 돈을 벌고 있다는 뜻입니다.",
        category: "현금 소진",
      },
      {
        name: "Runway",
        value: runway(yearData.cashBalance, monthlyNetBurn),
        unit: "개월",
        description:
          "현재 속도로 돈을 쓰면 버틸 수 있는 기간. 12개월 이상이면 안전합니다.",
        category: "현금 소진",
      },

      // ── 손익 구조 (4개) ──
      {
        name: "BEP 달성률",
        value: bepRatio(yearData.revenue, yearData.operatingExpenses),
        unit: "%",
        description:
          "매출이 비용의 몇 %인지. 100% 이상이면 손익분기점 달성입니다.",
        category: "손익 구조",
      },
      {
        name: "매출총이익률",
        value: grossMargin(yearData.grossProfit, yearData.revenue),
        unit: "%",
        description:
          "원가를 빼고 남는 이익률. 제품/서비스 자체의 수익성입니다.",
        category: "손익 구조",
      },
      {
        name: "영업이익률",
        value: operatingMargin(yearData.operatingProfit, yearData.revenue),
        unit: "%",
        description: "매출 대비 영업이익. 본업의 수익성을 보여줍니다.",
        category: "손익 구조",
      },
      {
        name: "매출 성장률 (YoY)",
        value: yoyGrowth(yearData.revenue, prevYear?.revenue ?? null),
        unit: "%",
        description: "전년 대비 매출 증감률. 성장 속도를 보여줍니다.",
        category: "손익 구조",
      },

      // ── 현금 흐름 (2개) ──
      {
        name: "영업활동 현금흐름",
        value: yearData.operatingCashFlow,
        unit: "원",
        description:
          "본업으로 실제 들어온 현금. 양수가 건강한 상태입니다.",
        category: "현금 흐름",
      },
      {
        name: "기말 현금잔고",
        value: yearData.cashBalance,
        unit: "원",
        description:
          "회계연도 말 보유 현금. Runway 계산의 기준이 됩니다.",
        category: "현금 흐름",
      },
    ];

    return { year: yearData.year, metrics };
  });
}
