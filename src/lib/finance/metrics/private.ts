import type { FinancialData, YearData } from "../types";

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

// ════════════════════════════════════════════════════════════
// v4 신규 — 비상장 심화 지표 (UI에서 별도 섹션으로 표시)
// ════════════════════════════════════════════════════════════

/**
 * Runway 4시나리오: 현 Burn 유지 / 긴축(-20%) / 성장(+20%) / 최악(매출 -30%)
 *
 * 왜 4시나리오인가:
 * - 단일 Runway 숫자는 "현재 그대로 유지"라는 비현실적 가정을 깔고 있음
 * - VC는 "경기 나빠지면 / 허리띠 조이면 / 공격적으로 쓰면" 각각의 Runway를 본다
 * - 시나리오 간 격차가 크면 = 위험이 매출에 크게 종속되어 있음을 시사
 */
export type RunwayScenarios = {
  baseline: { runway: number | null; assumption: string };
  tight: { runway: number | null; assumption: string };
  growth: { runway: number | null; assumption: string };
  worst: { runway: number | null; assumption: string };
};

export function calcRunwayScenarios(latest: YearData): RunwayScenarios {
  const monthlyOpEx = latest.operatingExpenses
    ? Math.abs(latest.operatingExpenses) / 12
    : null;
  const monthlyRev = latest.revenue ? latest.revenue / 12 : 0;
  const cash = latest.cashBalance ?? 0;

  const runwayFor = (monthlyBurn: number | null): number | null => {
    if (monthlyBurn === null) return null;
    if (monthlyBurn <= 0) return 999; // 흑자
    return cash / monthlyBurn;
  };

  // 각 시나리오의 Net Burn (영업비용 - 매출)
  const baselineBurn =
    monthlyOpEx !== null ? Math.max(0, monthlyOpEx - monthlyRev) : null;
  const tightBurn =
    monthlyOpEx !== null ? Math.max(0, monthlyOpEx * 0.8 - monthlyRev) : null;
  const growthBurn =
    monthlyOpEx !== null ? Math.max(0, monthlyOpEx * 1.2 - monthlyRev) : null;
  const worstBurn =
    monthlyOpEx !== null
      ? Math.max(0, monthlyOpEx - monthlyRev * 0.7)
      : null;

  return {
    baseline: {
      runway: runwayFor(baselineBurn),
      assumption: "현재 Burn·매출 유지",
    },
    tight: {
      runway: runwayFor(tightBurn),
      assumption: "영업비용 20% 절감",
    },
    growth: {
      runway: runwayFor(growthBurn),
      assumption: "영업비용 20% 증가 (공격 투자)",
    },
    worst: {
      runway: runwayFor(worstBurn),
      assumption: "매출 30% 감소 (경기 침체)",
    },
  };
}

/**
 * BEP 역산: 흑자 전환에 필요한 추가 매출 + 성장률
 *
 * 공식: 필요 매출 = 고정비 / (1 − 변동비율)
 *   - 변동비율 = 매출원가 / 매출
 *   - 고정비 = 판관비 (단순화 가정 — 실무에선 추가 분석 필요)
 *
 * 이미 흑자면 null 반환 (필요 없음).
 */
export type BepReverse = {
  requiredRevenue: number | null;
  revenueGapPct: number | null;
  requiredGrowthPct: number | null;
  isAlreadyProfitable: boolean;
};

export function calcBepReverse(y: YearData): BepReverse {
  const already = y.operatingProfit !== null && y.operatingProfit >= 0;
  if (
    already ||
    y.revenue === null ||
    y.revenue === 0 ||
    y.costOfGoodsSold === null ||
    y.sgaExpenses === null
  ) {
    return {
      requiredRevenue: null,
      revenueGapPct: null,
      requiredGrowthPct: null,
      isAlreadyProfitable: already,
    };
  }

  const variableCostRatio = Math.abs(y.costOfGoodsSold) / y.revenue;
  const fixedCost = Math.abs(y.sgaExpenses);

  if (variableCostRatio >= 1) {
    // 변동비가 매출을 이미 초과 → BEP 불가능 (구조 자체 재검토)
    return {
      requiredRevenue: null,
      revenueGapPct: null,
      requiredGrowthPct: null,
      isAlreadyProfitable: false,
    };
  }

  const requiredRevenue = fixedCost / (1 - variableCostRatio);
  const revenueGapPct = ((requiredRevenue - y.revenue) / y.revenue) * 100;

  return {
    requiredRevenue,
    revenueGapPct,
    requiredGrowthPct: revenueGapPct, // 같은 값이지만 의미(필요 성장률)가 다름
    isAlreadyProfitable: false,
  };
}

/**
 * 현금 포지션 3분류: 즉시가용 / 사용제한
 *
 * restrictedCash가 PDF에 없으면 대부분 null → 전액 즉시가용으로 가정.
 * 이 경우 주석(assumptionNote)으로 가정을 명시한다.
 */
export type CashPosition = {
  immediate: number | null;
  restricted: number | null;
  total: number | null;
  assumptionNote: string | null;
};

export function calcCashPosition(y: YearData): CashPosition {
  const total = y.cashBalance;
  if (total === null) {
    return { immediate: null, restricted: null, total: null, assumptionNote: null };
  }

  if (y.restrictedCash !== null && y.restrictedCash > 0) {
    return {
      immediate: total - y.restrictedCash,
      restricted: y.restrictedCash,
      total,
      assumptionNote: null,
    };
  }

  // 사용제한 현금 데이터 없음 → 전액 즉시가용으로 가정
  return {
    immediate: total,
    restricted: 0,
    total,
    assumptionNote: "재무제표에 사용제한 현금이 별도 기재되지 않음 — 전액 즉시가용으로 가정",
  };
}

/**
 * Burn YoY: Gross/Net Burn 전년 대비 증감률 (%).
 *
 * 해석:
 * - 매출 성장과 함께 Burn이 증가하면 "규모 확장 국면" (정상)
 * - 매출 정체인데 Burn만 증가하면 "비용 통제 실패" (경고)
 */
export type BurnYoY = {
  grossBurnYoY: number | null;
  netBurnYoY: number | null;
};

export function calcBurnYoY(latest: YearData, prior: YearData): BurnYoY {
  const grossLatest = latest.operatingExpenses
    ? Math.abs(latest.operatingExpenses) / 12
    : null;
  const grossPrior = prior.operatingExpenses
    ? Math.abs(prior.operatingExpenses) / 12
    : null;

  const netLatest =
    grossLatest !== null
      ? Math.max(0, grossLatest - (latest.revenue ?? 0) / 12)
      : null;
  const netPrior =
    grossPrior !== null
      ? Math.max(0, grossPrior - (prior.revenue ?? 0) / 12)
      : null;

  const yoy = (cur: number | null, prev: number | null): number | null => {
    if (cur === null || prev === null || prev === 0) return null;
    return ((cur - prev) / prev) * 100;
  };

  return {
    grossBurnYoY: yoy(grossLatest, grossPrior),
    netBurnYoY: yoy(netLatest, netPrior),
  };
}
