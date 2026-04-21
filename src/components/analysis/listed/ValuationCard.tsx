"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancialData } from "@/lib/finance/types";
import type { PeerData } from "@/lib/peers/types";
import { formatWon } from "../shared/format";

/**
 * 밸류에이션 카드 — 본 회사의 PER, PBR, PSR + 시가총액 + 52주 가격대.
 *
 * 데이터 소스:
 * - 네이버 금융 (`/api/peers`) — 종목코드로 시가총액·PER·PBR·EPS·BPS·52주 최고/최저
 * - PSR은 PDF 매출 + 네이버 시가총액으로 자체 계산 (시총 / 매출)
 *
 * 종목코드(stockCode)가 null이면 카드 자체를 안 그림 (비상장사 케이스).
 */
type Props = {
  stockCode: string | null;
  financialData: FinancialData;
};

export function ValuationCard({ stockCode, financialData }: Props) {
  const [peer, setPeer] = useState<PeerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stockCode) return;
    setLoading(true);
    setError(null);
    fetch("/api/peers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockCode }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data: PeerData) => {
        console.log("[ValuationCard] 네이버 응답:", stockCode, data);
        setPeer(data);
      })
      .catch((err) => setError(err.message ?? "조회 실패"))
      .finally(() => setLoading(false));
  }, [stockCode]);

  if (!stockCode) return null;

  // PSR = 시가총액 / 최신 연도 매출액
  const latestRevenue = financialData.years[0]?.revenue ?? null;
  const psr =
    peer?.marketCap !== null &&
    peer?.marketCap !== undefined &&
    latestRevenue !== null &&
    latestRevenue > 0
      ? peer.marketCap / latestRevenue
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">밸류에이션</CardTitle>
          <span className="text-xs text-muted-foreground">
            출처: 네이버 금융 (종목 {stockCode})
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          현재 주가 기준 — 동종업종 평균과 비교하여 할인/프리미엄 판단
        </p>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            네이버 금융에서 데이터 가져오는 중…
          </p>
        )}
        {error && !loading && (
          <p className="py-6 text-center text-sm text-red-600">
            데이터 조회 실패: {error}
          </p>
        )}
        {peer && !loading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <ValuationItem
              label="시가총액"
              value={peer.marketCap !== null ? formatWon(peer.marketCap) : "-"}
            />
            <ValuationItem
              label="PER"
              value={peer.per !== null ? `${peer.per.toFixed(2)}배` : "-"}
              hint="주가/주당순이익"
            />
            <ValuationItem
              label="PBR"
              value={peer.pbr !== null ? `${peer.pbr.toFixed(2)}배` : "-"}
              hint="주가/주당순자산"
            />
            <ValuationItem
              label="PSR"
              value={psr !== null ? `${psr.toFixed(2)}배` : "-"}
              hint="시가총액/매출"
            />
            <ValuationItem
              label="EPS"
              value={
                peer.eps !== null
                  ? `${peer.eps.toLocaleString()}원`
                  : "-"
              }
              hint="주당순이익"
            />
            <ValuationItem
              label="52주 최고/최저"
              value={
                peer.high52w !== null && peer.low52w !== null
                  ? `${peer.high52w.toLocaleString()} / ${peer.low52w.toLocaleString()}`
                  : "-"
              }
              hint="원"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ValuationItem({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
