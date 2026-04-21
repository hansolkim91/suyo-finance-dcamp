import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancialData, YearData } from "@/lib/finance/types";
import { formatWon, calcYoy } from "./format";
import { yoyBadge } from "./badges";

/**
 * 핵심 재무 요약표 — 절대 금액을 연도별로 표시.
 *
 * 상장·비상장 공통 사용. 연도 순서는 차트와 맞춰 과거→최신 (오름차순).
 * 원본 data.years는 최신→과거 순이므로 slice().reverse()로 뒤집어 렌더링.
 */
export function FinancialSummaryTable({ data }: { data: FinancialData }) {
  const years = data.years.slice().reverse();
  if (years.length === 0) return null;

  const rows: { label: string; key: keyof YearData }[] = [
    { label: "매출액", key: "revenue" },
    { label: "매출원가", key: "costOfGoodsSold" },
    { label: "매출총이익", key: "grossProfit" },
    { label: "영업이익", key: "operatingProfit" },
    { label: "당기순이익", key: "netIncome" },
    { label: "자산총계", key: "totalAssets" },
    { label: "부채총계", key: "totalLiabilities" },
    { label: "자본총계", key: "totalEquity" },
    { label: "영업활동 현금흐름", key: "operatingCashFlow" },
    { label: "현금·현금성자산", key: "cashBalance" },
  ];
  const visibleRows = rows.filter((row) =>
    years.some((y) => y[row.key] !== null)
  );
  const latestIdx = years.length - 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">핵심 재무 요약</CardTitle>
        <p className="text-xs text-muted-foreground">
          단위: 원 (조/억 자동 변환)
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sticky left-0 bg-background z-10">
                  항목
                </TableHead>
                {years.map((y, i) => (
                  <TableHead key={y.year} className="text-right min-w-[100px]">
                    {y.year}년
                    {i === latestIdx && years.length > 1 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        (최신)
                      </span>
                    )}
                  </TableHead>
                ))}
                {years.length > 1 && (
                  <TableHead className="text-right min-w-[80px]">
                    전년 대비
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const latestVal = years[latestIdx]?.[row.key] as number | null;
                const prevVal = years[latestIdx - 1]?.[row.key] as
                  | number
                  | null;
                const yoy = calcYoy(latestVal, prevVal);
                return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">
                      {row.label}
                    </TableCell>
                    {years.map((y) => (
                      <TableCell
                        key={y.year}
                        className="text-right tabular-nums"
                      >
                        {formatWon(y[row.key] as number | null)}
                      </TableCell>
                    ))}
                    {years.length > 1 && (
                      <TableCell className="text-right">
                        {yoyBadge(yoy)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
