import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BepReverse } from "@/lib/finance/metrics/private";
import { formatWon } from "../shared/format";

/**
 * BEP 역산 — 흑자 전환까지 필요한 추가 매출·성장률.
 *
 * 공식: 필요매출 = 고정비(판관비) / (1 − 변동비율(매출원가/매출))
 *
 * 3가지 상태:
 *  1) 이미 흑자 → "흑자 유지 중" 표시
 *  2) 적자 + BEP 계산 가능 → 필요 매출·성장률 큰 숫자
 *  3) 변동비 ≥ 매출 (원가가 매출 초과) → BEP 수학적 불가능, 구조 재검토 메시지
 */
export function BepReverseCard({
  bep,
  currentRevenue,
}: {
  bep: BepReverse;
  currentRevenue: number | null;
}) {
  // 1) 이미 흑자
  if (bep.isAlreadyProfitable) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🎯 BEP 역산</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-emerald-50 p-6 text-center dark:bg-emerald-950/30">
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              흑자 유지 중
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              영업이익이 이미 양수 — BEP 역산 불필요
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 3) BEP 불가능 (변동비가 매출 초과)
  if (bep.requiredRevenue === null) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🎯 BEP 역산</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-950/30">
            <p className="text-lg font-bold text-red-700 dark:text-red-400">
              원가 구조 재검토 필요
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              매출원가가 매출을 초과하거나 데이터가 부족하여 BEP 계산이
              불가능합니다. 가격 인상 또는 원가 구조 개선이 선행되어야 합니다.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 2) 적자 — BEP까지 추가 매출 + 성장률
  const gap = bep.requiredRevenue - (currentRevenue ?? 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">🎯 BEP 역산 (흑자 전환)</CardTitle>
        <p className="text-xs text-muted-foreground">
          변동비율과 고정비에서 역산한 손익분기점 매출
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4 text-center">
            <p className="text-xs text-muted-foreground">필요 매출</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {formatWon(bep.requiredRevenue)}
            </p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-xs text-muted-foreground">추가 매출 (현재 대비)</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {formatWon(gap)}
            </p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-xs text-muted-foreground">필요 성장률</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              +
              {bep.requiredGrowthPct !== null
                ? `${bep.requiredGrowthPct.toFixed(1)}%`
                : "-"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          ℹ️ 공식: 필요매출 = 고정비(판관비) ÷ (1 − 변동비율(매출원가/매출))
        </p>
      </CardContent>
    </Card>
  );
}
