/**
 * 상장사 지표의 4카테고리 분류 + 신호등 임계값
 *
 * 왜 별도 파일로 분리했나:
 * - metrics/listed.ts의 ListedMetric.category는 기존 4분류(수익성/안정성/성장성/효율성)
 *   지만, v4 화면은 4섹션(성장성/수익성/안정성/유동성)로 재구성됨
 * - metrics 자체를 건드리면 회귀 위험 → 화면 분류와 임계값은 여기서만 관리
 * - 7단계 UI 재구성 시 이 파일의 CATEGORIES / THRESHOLDS를 import하여 사용
 */

export type DashboardCategory =
  | "성장성"
  | "수익성"
  | "안정성"
  | "유동성";

/**
 * 화면 4섹션에 어떤 지표를 배치할지 정의.
 * metrics/listed.ts의 metric.name을 키로 사용.
 */
export const CATEGORY_METRICS: Record<DashboardCategory, string[]> = {
  성장성: [
    "매출 성장률 (YoY)",
    "영업이익 성장률 (YoY)",
    "순이익 성장률 (YoY)",
  ],
  수익성: [
    "매출총이익률",
    "영업이익률",
    "순이익률",
    "EBITDA 마진",
    "ROE (자기자본이익률)",
    "ROA (총자산이익률)",
    "매출원가율",
  ],
  안정성: [
    "부채비율",
    "자기자본비율",
    "이자보상배율",
  ],
  유동성: [
    "유동비율",
    "당좌비율",
    "현금비율",
  ],
};

export type SignalStatus = "good" | "neutral" | "warning";

/**
 * 지표별 신호등 임계값. 값이 good 기준 이상이면 양호(초록),
 * warning 기준 이하이면 주의(빨강), 사이면 보통(노랑).
 *
 * 일부 지표는 "낮을수록 좋음"이라 invert=true로 표시.
 */
type Threshold = {
  good: number;
  warning: number;
  invert?: boolean; // true면 "낮을수록 좋음" (부채비율, 매출원가율 등)
};

export const THRESHOLDS: Record<string, Threshold> = {
  // ── 성장성 (YoY %, 높을수록 좋음) ──
  "매출 성장률 (YoY)": { good: 10, warning: 0 },
  "영업이익 성장률 (YoY)": { good: 10, warning: 0 },
  "순이익 성장률 (YoY)": { good: 10, warning: 0 },

  // ── 수익성 (%, 높을수록 좋음 — 단 매출원가율은 invert) ──
  매출총이익률: { good: 30, warning: 15 },
  영업이익률: { good: 10, warning: 3 },
  순이익률: { good: 7, warning: 2 },
  "EBITDA 마진": { good: 15, warning: 5 },
  "ROE (자기자본이익률)": { good: 15, warning: 5 },
  "ROA (총자산이익률)": { good: 7, warning: 2 },
  매출원가율: { good: 70, warning: 85, invert: true },

  // ── 안정성 ──
  부채비율: { good: 100, warning: 200, invert: true }, // 낮을수록 좋음
  자기자본비율: { good: 50, warning: 30 },
  이자보상배율: { good: 5, warning: 1 },

  // ── 유동성 (%, 높을수록 좋음) ──
  유동비율: { good: 200, warning: 100 },
  당좌비율: { good: 100, warning: 50 },
  현금비율: { good: 20, warning: 10 },
};

/**
 * 지표명 → 한 줄 설명 매핑 (UI 호버 툴팁용).
 *
 * metrics/listed.ts 안에도 description이 있지만, AI 응답이나 이름 표기 차이로
 * 매칭이 안 되는 경우 대비 — 이 매핑을 1차로 사용해서 일관성을 보장한다.
 */
export const METRIC_DESCRIPTIONS: Record<string, string> = {
  // 성장성
  "매출 성장률 (YoY)":
    "전년 대비 매출 증감률. 회사가 얼마나 빨리 크고 있는지 보여줍니다.",
  "영업이익 성장률 (YoY)":
    "전년 대비 영업이익 증감률. 본업의 이익이 개선·악화됐는지 판단합니다.",
  "순이익 성장률 (YoY)":
    "전년 대비 당기순이익 증감률. 모든 비용 차감 후 최종 이익 추세입니다.",

  // 수익성
  매출총이익률:
    "매출에서 원가를 빼고 남는 비율. 제품·서비스 자체의 마진을 보여줍니다.",
  영업이익률:
    "매출 대비 영업이익 비율. 본업으로 얼마나 효율적으로 이익을 내는지를 의미합니다.",
  순이익률:
    "매출 대비 당기순이익 비율. 세금·이자 모두 차감 후 실제 남는 이익입니다.",
  "EBITDA 마진":
    "감가상각 전 영업이익률. 설비 투자가 큰 업종 간 비교에 유용합니다.",
  "ROE (자기자본이익률)":
    "주주 투자 대비 이익률. 10% 이상 양호, 15% 이상 우수입니다.",
  "ROA (총자산이익률)":
    "전체 자산 대비 이익률. 자산을 얼마나 잘 활용했는지 보여줍니다.",
  매출원가율:
    "매출 대비 원가 비중. 낮을수록 원가 효율이 좋습니다.",

  // 안정성
  부채비율:
    "자본 대비 부채 비율. 100% 이하면 안정적, 200% 이상이면 주의가 필요합니다.",
  자기자본비율:
    "전체 자산 중 내 돈(자본)의 비중. 50% 이상이면 재무 안정성이 높습니다.",
  이자보상배율:
    "영업이익으로 이자를 몇 배 갚을 수 있는지. 1배 미만이면 이자도 못 갚는 상태입니다.",

  // 유동성
  유동비율:
    "유동자산 ÷ 유동부채. 1년 내 갚을 빚을 갚을 수 있는 능력. 200% 이상 양호.",
  당좌비율:
    "(유동자산 − 재고자산) ÷ 유동부채. 재고를 못 팔아도 갚을 수 있는지 보는 보수적 지표. 100% 이상 양호.",
  현금비율:
    "현금 ÷ 유동부채. 가장 보수적인 지급능력 — 즉시 동원 가능한 현금만으로 단기 부채를 감당. 20% 이상 양호.",
};

/**
 * 지표 값과 이름으로 신호등 상태를 계산한다.
 */
export function getSignalStatus(
  metricName: string,
  value: number | null
): SignalStatus {
  if (value === null) return "neutral";
  const t = THRESHOLDS[metricName];
  if (!t) return "neutral";

  if (t.invert) {
    // 낮을수록 좋음
    if (value <= t.good) return "good";
    if (value >= t.warning) return "warning";
    return "neutral";
  }
  // 높을수록 좋음
  if (value >= t.good) return "good";
  if (value <= t.warning) return "warning";
  return "neutral";
}
