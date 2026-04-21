import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CashPosition } from "@/lib/finance/metrics/private";
import { formatWon } from "../shared/format";

/**
 * 현금 포지션 — 즉시가용 / 사용제한 스택 바 + 합계 카드.
 *
 * 왜 분리해서 보여주는가:
 *  - 스타트업 재무제표의 "현금"은 일부가 담보/보증금/사용제한 금액일 수 있음
 *  - Runway 계산의 정확성을 위해 "즉시 쓸 수 있는 현금"만 구분이 필요
 *  - restrictedCash가 null이면 "전액 즉시가용으로 가정" 주석 표시
 */
export function CashPositionBar({ position }: { position: CashPosition }) {
  if (position.total === null) return null;

  const immediate = position.immediate ?? 0;
  const restricted = position.restricted ?? 0;
  const total = position.total;
  const immediatePct = total > 0 ? (immediate / total) * 100 : 0;
  const restrictedPct = total > 0 ? (restricted / total) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">💵 현금 포지션</CardTitle>
        <p className="text-xs text-muted-foreground">
          즉시가용 vs 사용제한 분리 — Runway 계산의 기준
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 합계 + 구성 */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">총 현금</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatWon(total)}
            </p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                즉시가용
              </p>
              <p className="text-base font-semibold tabular-nums">
                {formatWon(immediate)}
              </p>
            </div>
            {restricted > 0 && (
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  사용제한
                </p>
                <p className="text-base font-semibold tabular-nums">
                  {formatWon(restricted)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 스택 바 */}
        <div className="h-6 w-full overflow-hidden rounded-md border bg-muted">
          <div className="flex h-full w-full">
            <div
              className="flex h-full items-center justify-center bg-emerald-500 text-[10px] font-semibold text-white transition-all"
              style={{ width: `${immediatePct}%` }}
              title={`즉시가용 ${immediatePct.toFixed(0)}%`}
            >
              {immediatePct >= 15 && `${immediatePct.toFixed(0)}%`}
            </div>
            {restricted > 0 && (
              <div
                className="flex h-full items-center justify-center bg-amber-400 text-[10px] font-semibold text-white transition-all"
                style={{ width: `${restrictedPct}%` }}
                title={`사용제한 ${restrictedPct.toFixed(0)}%`}
              >
                {restrictedPct >= 15 && `${restrictedPct.toFixed(0)}%`}
              </div>
            )}
          </div>
        </div>

        {position.assumptionNote && (
          <p className="text-[11px] italic text-muted-foreground">
            ℹ️ {position.assumptionNote}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
