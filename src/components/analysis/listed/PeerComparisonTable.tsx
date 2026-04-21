"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancialData, PeerSuggestion } from "@/lib/finance/types";
import type { PeerData } from "@/lib/peers/types";
import { formatWon } from "../shared/format";

/**
 * 동종업계 비교 표 — 본 회사 + AI가 추천한 동종 한국 상장사 3개의 외형/밸류에이션 비교.
 *
 * 비교 항목:
 *  - 시가총액(외형)
 *  - 매출액 (본 회사는 PDF, peers는 네이버에서 못 가져오므로 "-")
 *  - 영업이익률 (본 회사만 — PDF, peers는 비교 데이터 없음)
 *  - PER, PBR (네이버 금융)
 *
 * 추천이 0개거나 stockCode가 없으면 안 그림.
 */
type Props = {
  thisStockCode: string | null;
  thisFinancialData: FinancialData;
  peerSuggestions: PeerSuggestion[];
};

export function PeerComparisonTable({
  thisStockCode,
  thisFinancialData,
  peerSuggestions,
}: Props) {
  const [thisPeer, setThisPeer] = useState<PeerData | null>(null);
  const [peers, setPeers] = useState<PeerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (peerSuggestions.length === 0 && !thisStockCode) return;

    setLoading(true);
    setError(null);

    const codes = [
      ...(thisStockCode ? [thisStockCode] : []),
      ...peerSuggestions.map((p) => p.code),
    ];

    fetch("/api/peers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockCodes: codes }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json() as Promise<PeerData[]>;
      })
      .then((data) => {
        if (thisStockCode) {
          setThisPeer(data[0]);
          setPeers(data.slice(1));
        } else {
          setPeers(data);
        }
      })
      .catch((err) => setError(err.message ?? "조회 실패"))
      .finally(() => setLoading(false));
  }, [thisStockCode, peerSuggestions]);

  if (peerSuggestions.length === 0) return null;

  // 본 회사 영업이익률 (PDF에서 계산)
  const latest = thisFinancialData.years[0];
  const thisOpMargin =
    latest?.operatingProfit !== null &&
    latest?.operatingProfit !== undefined &&
    latest?.revenue !== null &&
    latest?.revenue !== undefined &&
    latest.revenue > 0
      ? (latest.operatingProfit / latest.revenue) * 100
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">동종업계 비교</CardTitle>
          <span className="text-xs text-muted-foreground">
            출처: 네이버 금융 (실시간)
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          AI가 추천한 동종업종 한국 상장사와의 외형·밸류에이션 비교
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            동종업체 데이터 가져오는 중…
          </p>
        )}
        {error && !loading && (
          <p className="py-6 text-center text-sm text-red-600">
            조회 실패: {error}
          </p>
        )}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px] sticky left-0 bg-background z-10">
                    회사
                  </TableHead>
                  <TableHead className="text-right">시가총액</TableHead>
                  <TableHead className="text-right">PER</TableHead>
                  <TableHead className="text-right">PBR</TableHead>
                  <TableHead className="text-right">영업이익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 본 회사 행 (강조) */}
                {thisPeer && (
                  <TableRow className="bg-blue-50/50 dark:bg-blue-950/20 font-semibold">
                    <TableCell className="sticky left-0 bg-blue-50/50 dark:bg-blue-950/20">
                      {thisFinancialData.companyName}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        (본 회사)
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {thisPeer.marketCap !== null
                        ? formatWon(thisPeer.marketCap)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {thisPeer.per !== null ? `${thisPeer.per.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {thisPeer.pbr !== null ? `${thisPeer.pbr.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {thisOpMargin !== null
                        ? `${thisOpMargin.toFixed(1)}%`
                        : "-"}
                    </TableCell>
                  </TableRow>
                )}
                {/* 동종업체 행 */}
                {peers.map((p, i) => (
                  <TableRow key={p.stockCode}>
                    <TableCell className="font-medium sticky left-0 bg-background">
                      {p.companyName ?? peerSuggestions[i]?.name ?? p.stockCode}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.marketCap !== null ? formatWon(p.marketCap) : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.per !== null ? `${p.per.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.pbr !== null ? `${p.pbr.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      -
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="px-4 py-2 text-[11px] text-muted-foreground">
              영업이익률은 본 회사만 PDF에서 계산 — 동종업체는 네이버 금융 데이터에 미포함
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
