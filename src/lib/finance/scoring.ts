import type { ListedMetrics } from "./metrics/listed";
import type { PrivateMetrics, BurnYoY } from "./metrics/private";
import type { SignalStatus } from "./thresholds";

/**
 * 결정론적 카테고리 점수 모듈.
 *
 * 설계 원칙 (v5):
 * - LLM은 추출과 자연어만 담당 — 점수·검증·산수는 모두 이 파일에서
 * - 동일 metrics 입력 → 동일 점수 출력 (재현성 보장)
 * - 임계값 단일 출처 (이전엔 explain 프롬프트와 라우트 override 두 곳에 분산)
 *
 * 임계값 출처:
 * - 상장: explain/route.ts의 listedPrompt에 있던 0~100 매핑 그대로 이식
 * - 비상장: privatePrompt의 VC 루브릭 그대로 이식
 */

export type CategoryScores = {
  profitability: number;
  stability: number;
  growth: number;
  efficiency: number;
  cashflow: number;
};

/**
 * 가중치 — explain 프롬프트에 있던 값을 코드로 옮김.
 *
 * 비상장(VC 관점)은 "안 망하는가(Runway)"가 가장 중요해서 stability 35%로 상향.
 * 상장은 수익성·안정성을 동등하게 25%씩.
 */
const LISTED_WEIGHTS: CategoryScores = {
  profitability: 0.25,
  stability: 0.25,
  growth: 0.2,
  efficiency: 0.15,
  cashflow: 0.15,
};

const PRIVATE_WEIGHTS: CategoryScores = {
  stability: 0.35, // Runway가 VC 평가의 핵심
  growth: 0.25,
  profitability: 0.15,
  efficiency: 0.15,
  cashflow: 0.1,
};

// ──────────────────────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────────────────────

type NamedMetric = { name: string; value: number | null };

function getValue(metrics: NamedMetric[], name: string): number | null {
  return metrics.find((m) => m.name === name)?.value ?? null;
}

// ──────────────────────────────────────────────────────────────
// 상장 점수 함수 (listedPrompt 임계값 그대로)
// ──────────────────────────────────────────────────────────────

/**
 * 영업이익률 → 수익성 점수
 * 임계값: ≥20=90, ≥10=75, ≥5=60, ≥0=40, <0=15
 */
function scoreOpMargin(v: number | null): number {
  if (v === null) return 50;
  if (v >= 20) return 90;
  if (v >= 10) return 75;
  if (v >= 5) return 60;
  if (v >= 0) return 40;
  return 15;
}

/**
 * 부채비율 → 안정성 점수 (낮을수록 좋음)
 * 임계값: ≤50=90, ≤100=70, ≤200=50, >200=30
 */
function scoreDebtRatio(v: number | null): number {
  if (v === null) return 50;
  if (v <= 50) return 90;
  if (v <= 100) return 70;
  if (v <= 200) return 50;
  return 30;
}

/**
 * 매출 YoY → 성장성 점수
 * 임계값: ≥20=90, ≥10=70, ≥0=50, <0=20
 */
function scoreRevGrowth(v: number | null): number {
  if (v === null) return 50;
  if (v >= 20) return 90;
  if (v >= 10) return 70;
  if (v >= 0) return 50;
  return 20;
}

/**
 * ROE → 효율성 점수
 * 임계값: ≥20=90, ≥15=75, ≥10=60, ≥5=45, ≥0=30, <0=15
 */
function scoreRoe(v: number | null): number {
  if (v === null) return 50;
  if (v >= 20) return 90;
  if (v >= 15) return 75;
  if (v >= 10) return 60;
  if (v >= 5) return 45;
  if (v >= 0) return 30;
  return 15;
}

/**
 * 현금창출력 점수 (영업CF 직접값이 metrics에 노출 안 되어 있어
 * 영업이익률 + 부채비율 결합 룰로 간접 추정).
 *
 * 룰:
 * - 영업이익률 ≥15% AND 부채비율 ≤100% → 90 (우량)
 * - 영업이익률 ≥10% → 75
 * - 영업이익률 ≥5% → 60
 * - 영업이익률 >0% → 55
 * - 적자 → 30
 * - 데이터 없음 → 50
 */
function scoreCashflow(
  opMargin: number | null,
  debtRatio: number | null
): number {
  if (opMargin === null) return 50;
  if (opMargin >= 15 && (debtRatio ?? Infinity) <= 100) return 90;
  if (opMargin >= 10) return 75;
  if (opMargin >= 5) return 60;
  if (opMargin > 0) return 55;
  return 30;
}

/**
 * 상장사 5카테고리 점수 — 최신 연도 기준.
 *
 * 입력은 calculateListedMetrics() 결과 그대로.
 * 최신 연도가 배열 인덱스 0이라고 가정 (현재 코드 컨벤션).
 */
export function scoreListed(allYears: ListedMetrics[]): CategoryScores {
  const latest = allYears[0]?.metrics ?? [];

  const opMargin = getValue(latest, "영업이익률");
  const debtRatio = getValue(latest, "부채비율");
  const revGrowth = getValue(latest, "매출 성장률 (YoY)");
  const roe = getValue(latest, "ROE (자기자본이익률)");

  return {
    profitability: scoreOpMargin(opMargin),
    stability: scoreDebtRatio(debtRatio),
    growth: scoreRevGrowth(revGrowth),
    efficiency: scoreRoe(roe),
    cashflow: scoreCashflow(opMargin, debtRatio),
  };
}

// ──────────────────────────────────────────────────────────────
// 비상장 점수 함수 (privatePrompt VC 루브릭 그대로)
// ──────────────────────────────────────────────────────────────

/**
 * Runway → 안정성 점수 (VC가 가장 먼저 보는 지표)
 * 흑자(Net Burn ≤0)면 95, 그 외엔 Runway 길이로:
 *   ≥18=90, ≥12=70, ≥6=40, <6=15
 */
function scoreRunway(
  runway: number | null,
  netBurn: number | null
): number {
  if (netBurn !== null && netBurn <= 0) return 95;
  if (runway === null) return 50;
  if (runway >= 18) return 90;
  if (runway >= 12) return 70;
  if (runway >= 6) return 40;
  return 15;
}

/**
 * 매출 YoY → 성장성 점수 (VC 기준은 상장보다 빡셈)
 * ≥50=95(하이퍼), ≥20=80, ≥5=60, ≥0=40, <0=20
 */
function scoreRevGrowthVc(v: number | null): number {
  if (v === null) return 50;
  if (v >= 50) return 95;
  if (v >= 20) return 80;
  if (v >= 5) return 60;
  if (v >= 0) return 40;
  return 20;
}

/**
 * 매출총이익률(GM) + 영업이익률(OPM) → 수익성 점수
 * GM≥60 또는 OPM≥10 = 85, GM≥30 = 60, 적자지만 GM 양수 = 40, GM≤0 = 15
 */
function scoreGmOpm(
  gm: number | null,
  opm: number | null
): number {
  if (gm === null && opm === null) return 50;
  if ((gm !== null && gm >= 60) || (opm !== null && opm >= 10)) return 85;
  if (gm !== null && gm >= 30) return 60;
  if (gm !== null && gm > 0) return 40;
  return 15;
}

/**
 * Burn YoY → 효율성 점수 (Burn 대비 매출 성장으로 평가)
 *   - Burn 감소 + 매출 성장 = 90
 *   - Burn YoY ≤20% + 매출 성장 = 70
 *   - Burn YoY ≥50% = 30
 *   - 그 외 = 50 (데이터 부족 포함)
 */
function scoreBurnYoY(
  burnYoY: BurnYoY | null,
  revGrowth: number | null
): number {
  if (burnYoY === null) return 50;
  const yoy = burnYoY.grossBurnYoY;
  if (yoy === null) return 50;
  const isGrowing = revGrowth !== null && revGrowth > 0;
  if (yoy < 0 && isGrowing) return 90;
  if (yoy <= 20 && isGrowing) return 70;
  if (yoy >= 50) return 30;
  return 50;
}

/**
 * 영업CF + 현금잔고 → 현금창출력 점수
 *   - 영업CF 양수 = 80
 *   - 영업CF 음수 BUT 현금잔고 ≥ NetBurn × 18개월 = 55 (Runway 충분)
 *   - 영업CF 음수 + 현금 부족 = 25
 *   - 데이터 없음 = 50
 */
function scoreOcfCash(
  ocf: number | null,
  netBurnPerMonth: number | null,
  cashBalance: number | null
): number {
  if (ocf === null) return 50;
  if (ocf > 0) return 80;
  if (
    netBurnPerMonth !== null &&
    netBurnPerMonth > 0 &&
    cashBalance !== null
  ) {
    const monthsOfCash = cashBalance / netBurnPerMonth;
    if (monthsOfCash >= 18) return 55;
  }
  return 25;
}

/**
 * 비상장사 5카테고리 점수.
 *
 * BurnYoY는 옵셔널 — calcBurnYoY(latest, prior) 결과 전달 권장.
 * 없으면 efficiency=50 기본값.
 */
export function scorePrivate(
  allYears: PrivateMetrics[],
  burnYoY: BurnYoY | null = null
): CategoryScores {
  const latest = allYears[0]?.metrics ?? [];

  const runway = getValue(latest, "Runway");
  const netBurnPerMonth = getValue(latest, "Net Burn Rate");
  const cashBalance = getValue(latest, "기말 현금잔고");
  const ocf = getValue(latest, "영업활동 현금흐름");
  const revGrowth = getValue(latest, "매출 성장률 (YoY)");
  const gm = getValue(latest, "매출총이익률");
  const opm = getValue(latest, "영업이익률");

  return {
    stability: scoreRunway(runway, netBurnPerMonth),
    growth: scoreRevGrowthVc(revGrowth),
    profitability: scoreGmOpm(gm, opm),
    efficiency: scoreBurnYoY(burnYoY, revGrowth),
    cashflow: scoreOcfCash(ocf, netBurnPerMonth, cashBalance),
  };
}

// ──────────────────────────────────────────────────────────────
// 종합 점수 + 체크리스트 status
// ──────────────────────────────────────────────────────────────

/**
 * 5카테고리 점수의 가중평균 → 종합 점수 (0~100 정수).
 */
export function calcOverall(
  scores: CategoryScores,
  type: "listed" | "private"
): number {
  const w = type === "listed" ? LISTED_WEIGHTS : PRIVATE_WEIGHTS;
  const total =
    scores.profitability * w.profitability +
    scores.stability * w.stability +
    scores.growth * w.growth +
    scores.efficiency * w.efficiency +
    scores.cashflow * w.cashflow;
  return Math.round(total);
}

/**
 * 점수 → 신호등 status 변환 (체크리스트·카테고리 카드 색상에 사용).
 */
export function statusFromScore(score: number): SignalStatus {
  if (score >= 70) return "good";
  if (score >= 40) return "neutral";
  return "warning";
}

/**
 * AI가 생성한 체크리스트 항목의 카테고리 이름 → CategoryScores 키 매핑.
 *
 * 왜 부분 일치 검색인가:
 * - AI가 "리스크 신호" vs "리스크" vs "리스크 & 투자 포인트" 등 변형으로 응답할 수 있음
 * - includes()로 느슨하게 매칭 → 매핑 실패해도 neutral로 안전 fallback
 */
const LISTED_CHECKLIST_KEY: Array<[string, keyof CategoryScores]> = [
  ["사업모델", "profitability"],
  ["매출", "growth"], // "매출·이익 흐름"
  ["재무건전성", "stability"],
  ["리스크", "stability"], // 안 망하는 능력 = 리스크 평가
  ["비교", "efficiency"], // "비교·평가"
];

const PRIVATE_CHECKLIST_KEY: Array<[string, keyof CategoryScores]> = [
  ["사업모델", "profitability"],
  ["현금 소진", "stability"], // Runway 기반
  ["Burn", "stability"],
  ["손익", "growth"], // "손익 구조 & 성장"
  ["자본", "stability"], // "자본·차입 구조"
  ["리스크", "stability"], // "리스크 & 투자 포인트"
];

/**
 * 체크리스트 카테고리명 → 해당 카테고리 점수 → status.
 *
 * 매핑 실패 시 neutral 반환 (UI에서 회색 배지).
 */
export function checklistStatus(
  category: string,
  scores: CategoryScores,
  type: "listed" | "private"
): SignalStatus {
  const table = type === "listed" ? LISTED_CHECKLIST_KEY : PRIVATE_CHECKLIST_KEY;
  const matched = table.find(([keyword]) => category.includes(keyword));
  if (!matched) return "neutral";
  const scoreKey = matched[1];
  return statusFromScore(scores[scoreKey]);
}
