import type { FinancialData } from "../types";

/**
 * 상장사 재무 지표를 4개 카테고리, 14개 항목으로 계산한다.
 *
 * 카테고리 구분 이유:
 * - 수익성: 회사가 얼마나 잘 벌고 있는지
 * - 안정성: 망하지 않을 만큼 건강한지
 * - 성장성: 작년 대비 얼마나 성장했는지
 * - 효율성: 자원을 얼마나 잘 활용하는지
 */

export type ListedMetric = {
  name: string;
  value: number | null;
  unit: string;
  description: string;
  category: "수익성" | "안정성" | "성장성" | "효율성";
};

export type ListedMetrics = {
  year: string;
  metrics: ListedMetric[];
};

// ──────────────────── 수익성 지표 ────────────────────

// 매출총이익률 = 매출총이익 / 매출액 × 100
// 원재료·제조원가를 빼고 남는 이익률. 제품 자체의 마진을 보여줌
function grossMargin(
  grossProfit: number | null,
  revenue: number | null
): number | null {
  if (grossProfit === null || revenue === null || revenue === 0) return null;
  return (grossProfit / revenue) * 100;
}

// 영업이익률 = 영업이익 / 매출액 × 100
// 본업에서 얼마나 효율적으로 이익을 내는지
function operatingMargin(
  operatingProfit: number | null,
  revenue: number | null
): number | null {
  if (operatingProfit === null || revenue === null || revenue === 0) return null;
  return (operatingProfit / revenue) * 100;
}

// 순이익률 = 당기순이익 / 매출액 × 100
// 세금·이자 등 모든 비용 차감 후 실제 남는 이익 비율
function netMargin(
  netIncome: number | null,
  revenue: number | null
): number | null {
  if (netIncome === null || revenue === null || revenue === 0) return null;
  return (netIncome / revenue) * 100;
}

// EBITDA 마진 = (영업이익 + 감가상각비) / 매출액 × 100
// 감가상각 전 영업이익률. 설비 투자가 큰 업종에서 실질 수익성 비교에 유용
function ebitdaMargin(
  operatingProfit: number | null,
  depreciation: number | null,
  revenue: number | null
): number | null {
  if (operatingProfit === null || revenue === null || revenue === 0) return null;
  const ebitda = operatingProfit + (depreciation ?? 0);
  return (ebitda / revenue) * 100;
}

// ──────────────────── 안정성 지표 ────────────────────

// 부채비율 = 부채총계 / 자본총계 × 100
// 100% 이하면 안정적, 200% 이상이면 주의
function debtRatio(
  totalLiabilities: number | null,
  totalEquity: number | null
): number | null {
  if (totalLiabilities === null || totalEquity === null || totalEquity === 0)
    return null;
  return (totalLiabilities / totalEquity) * 100;
}

// 자기자본비율 = 자본총계 / 자산총계 × 100
// 전체 자산 중 빚이 아닌 내 돈의 비중. 50% 이상이면 안정적
function equityRatio(
  totalEquity: number | null,
  totalAssets: number | null
): number | null {
  if (totalEquity === null || totalAssets === null || totalAssets === 0)
    return null;
  return (totalEquity / totalAssets) * 100;
}

// 유동비율 = 유동자산 / 유동부채 × 100
// 1년 내 갚아야 할 빚을 갚을 수 있는 능력. 200% 이상이면 양호
function currentRatio(
  currentAssets: number | null,
  currentLiabilities: number | null
): number | null {
  if (
    currentAssets === null ||
    currentLiabilities === null ||
    currentLiabilities === 0
  )
    return null;
  return (currentAssets / currentLiabilities) * 100;
}

// 당좌비율 = (유동자산 - 재고자산) / 유동부채 × 100
// 유동비율보다 보수적인 단기 지급능력. 재고를 못 팔아도 갚을 수 있는지
// inventory가 null이면 유동비율과 동일 (재고 0으로 가정)
function quickRatio(
  currentAssets: number | null,
  inventory: number | null,
  currentLiabilities: number | null
): number | null {
  if (
    currentAssets === null ||
    currentLiabilities === null ||
    currentLiabilities === 0
  )
    return null;
  const quickAssets = currentAssets - (inventory ?? 0);
  return (quickAssets / currentLiabilities) * 100;
}

// 현금비율 = 현금및현금성자산 / 유동부채 × 100
// 가장 보수적인 지급능력. 즉시 동원 가능한 현금만으로 단기 부채를 갚을 수 있는지
function cashRatio(
  cashBalance: number | null,
  currentLiabilities: number | null
): number | null {
  if (
    cashBalance === null ||
    currentLiabilities === null ||
    currentLiabilities === 0
  )
    return null;
  return (cashBalance / currentLiabilities) * 100;
}

// 이자보상배율 = 영업이익 / 이자비용
// 벌어서 이자를 몇 배 갚을 수 있는지. 1 미만이면 이자도 못 갚는 상태
function interestCoverage(
  operatingProfit: number | null,
  interestExpense: number | null
): number | null {
  if (
    operatingProfit === null ||
    interestExpense === null ||
    interestExpense === 0
  )
    return null;
  return operatingProfit / Math.abs(interestExpense);
}

// ──────────────────── 성장성 지표 ────────────────────

// YoY 성장률 공통 함수
function yoyGrowth(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ──────────────────── 효율성 지표 ────────────────────

// ROE = 당기순이익 / 자본총계 × 100
function roe(
  netIncome: number | null,
  totalEquity: number | null
): number | null {
  if (netIncome === null || totalEquity === null || totalEquity === 0)
    return null;
  return (netIncome / totalEquity) * 100;
}

// ROA = 당기순이익 / 자산총계 × 100
function roa(
  netIncome: number | null,
  totalAssets: number | null
): number | null {
  if (netIncome === null || totalAssets === null || totalAssets === 0)
    return null;
  return (netIncome / totalAssets) * 100;
}

// 매출원가율 = 매출원가 / 매출액 × 100
// 낮을수록 원가 효율이 좋음
function cogsRatio(
  costOfGoodsSold: number | null,
  revenue: number | null
): number | null {
  if (costOfGoodsSold === null || revenue === null || revenue === 0) return null;
  return (Math.abs(costOfGoodsSold) / revenue) * 100;
}

// 판관비율 = 판관비 / 매출액 × 100
// 영업·관리 활동에 매출의 몇 %를 쓰는지
function sgaRatio(
  sgaExpenses: number | null,
  revenue: number | null
): number | null {
  if (sgaExpenses === null || revenue === null || revenue === 0) return null;
  return (Math.abs(sgaExpenses) / revenue) * 100;
}

/**
 * 상장사 재무 데이터로 14개 지표를 카테고리별로 계산.
 */
export function calculateListedMetrics(
  data: FinancialData
): ListedMetrics[] {
  return data.years.map((yearData, index) => {
    const prevYear = data.years[index + 1] ?? null;

    const metrics: ListedMetric[] = [
      // ── 수익성 (4개) ──
      {
        name: "매출총이익률",
        value: grossMargin(yearData.grossProfit, yearData.revenue),
        unit: "%",
        description: "원가를 빼고 남는 이익률. 제품/서비스 자체의 마진입니다.",
        category: "수익성",
      },
      {
        name: "영업이익률",
        value: operatingMargin(yearData.operatingProfit, yearData.revenue),
        unit: "%",
        description: "매출 대비 영업이익 비율. 본업의 수익성을 보여줍니다.",
        category: "수익성",
      },
      {
        name: "순이익률",
        value: netMargin(yearData.netIncome, yearData.revenue),
        unit: "%",
        description:
          "매출 대비 순이익 비율. 모든 비용 차감 후 실제 남는 이익입니다.",
        category: "수익성",
      },
      {
        name: "EBITDA 마진",
        value: ebitdaMargin(
          yearData.operatingProfit,
          yearData.depreciation,
          yearData.revenue
        ),
        unit: "%",
        description:
          "감가상각 전 영업이익률. 설비 투자가 큰 업종 간 비교에 유용합니다.",
        category: "수익성",
      },

      // ── 안정성 (4개) ──
      {
        name: "부채비율",
        value: debtRatio(yearData.totalLiabilities, yearData.totalEquity),
        unit: "%",
        description:
          "자본 대비 부채 비율. 100% 이하면 안정적, 200% 이상이면 주의가 필요합니다.",
        category: "안정성",
      },
      {
        name: "자기자본비율",
        value: equityRatio(yearData.totalEquity, yearData.totalAssets),
        unit: "%",
        description:
          "전체 자산 중 자기 돈의 비중. 50% 이상이면 재무 안정성이 높습니다.",
        category: "안정성",
      },
      {
        name: "유동비율",
        value: currentRatio(
          yearData.currentAssets,
          yearData.currentLiabilities
        ),
        unit: "%",
        description:
          "단기 채무 상환 능력. 200% 이상이면 양호, 100% 미만이면 위험합니다.",
        category: "안정성",
      },
      {
        name: "당좌비율",
        value: quickRatio(
          yearData.currentAssets,
          yearData.inventory,
          yearData.currentLiabilities
        ),
        unit: "%",
        description:
          "재고를 제외한 단기 지급능력. 100% 이상이면 양호, 재고 부담 큰 업종 평가에 유용합니다.",
        category: "안정성",
      },
      {
        name: "현금비율",
        value: cashRatio(yearData.cashBalance, yearData.currentLiabilities),
        unit: "%",
        description:
          "현금만으로 유동부채를 감당할 수 있는 비율. 20% 이상이면 양호합니다.",
        category: "안정성",
      },
      {
        name: "이자보상배율",
        value: interestCoverage(
          yearData.operatingProfit,
          yearData.interestExpense
        ),
        unit: "배",
        description:
          "영업이익으로 이자를 몇 번 갚을 수 있는지. 1 미만이면 이자도 못 갚는 상태입니다.",
        category: "안정성",
      },

      // ── 성장성 (3개) ──
      {
        name: "매출 성장률 (YoY)",
        value: yoyGrowth(yearData.revenue, prevYear?.revenue ?? null),
        unit: "%",
        description: "전년 대비 매출 증감률. 회사의 성장 속도를 보여줍니다.",
        category: "성장성",
      },
      {
        name: "영업이익 성장률 (YoY)",
        value: yoyGrowth(
          yearData.operatingProfit,
          prevYear?.operatingProfit ?? null
        ),
        unit: "%",
        description: "전년 대비 영업이익 증감률. 본업의 이익 성장 추세입니다.",
        category: "성장성",
      },
      {
        name: "순이익 성장률 (YoY)",
        value: yoyGrowth(yearData.netIncome, prevYear?.netIncome ?? null),
        unit: "%",
        description: "전년 대비 순이익 증감률. 전체 수익성의 개선/악화를 보여줍니다.",
        category: "성장성",
      },

      // ── 효율성 (3개) ──
      {
        name: "ROE (자기자본이익률)",
        value: roe(yearData.netIncome, yearData.totalEquity),
        unit: "%",
        description:
          "주주 투자 대비 이익률. 10% 이상이면 양호, 15% 이상이면 우수합니다.",
        category: "효율성",
      },
      {
        name: "ROA (총자산이익률)",
        value: roa(yearData.netIncome, yearData.totalAssets),
        unit: "%",
        description: "전체 자산 활용 효율. 업종 평균과 비교하면 좋습니다.",
        category: "효율성",
      },
      {
        name: "매출원가율",
        value: cogsRatio(yearData.costOfGoodsSold, yearData.revenue),
        unit: "%",
        description:
          "매출 대비 원가 비중. 낮을수록 원가 효율이 좋습니다.",
        category: "효율성",
      },
    ];

    return { year: yearData.year, metrics };
  });
}
