/**
 * 숫자 포맷터 — 화면 전체에서 일관된 표기.
 */

export function formatWon(value: number | null): string {
  if (value === null) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000)
    return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}조`;
  if (abs >= 100_000_000)
    return `${sign}${Math.round(abs / 100_000_000).toLocaleString()}억`;
  if (abs >= 10_000)
    return `${sign}${Math.round(abs / 10_000).toLocaleString()}만`;
  return `${sign}${abs.toLocaleString()}`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}%`;
}

export function formatRatio(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}배`;
}

export function calcYoy(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * 차트 축/툴팁용 — 입력은 "억" 단위 숫자.
 * 1만억(=1조) 이상이면 "X.X조", 그 미만이면 "X,XXX억".
 *
 * 예) 80,000 → "8.0조", 5,300 → "5,300억"
 */
export function formatChartAmount(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}조`;
  return `${v.toLocaleString()}억`;
}
