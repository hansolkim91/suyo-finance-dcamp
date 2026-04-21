import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunwayScenarios } from "@/lib/finance/metrics/private";

/**
 * Runway 4시나리오 표 — 비상장 화면의 핵심.
 *
 * 왜 4시나리오인가:
 *  - 단일 Runway 숫자는 "현재 그대로 유지"라는 비현실적 가정
 *  - VC는 "경기 나빠지면 / 허리띠 조이면 / 공격적으로 쓰면" 각각의 Runway 확인
 *  - 시나리오 간 격차가 크면 = 매출·비용에 따라 생존성이 크게 변동 = 리스크 ↑
 */
export function RunwayScenarioTable({
  scenarios,
}: {
  scenarios: RunwayScenarios;
}) {
  const rows: {
    key: keyof RunwayScenarios;
    label: string;
    emoji: string;
  }[] = [
    { key: "baseline", label: "현상 유지", emoji: "🔵" },
    { key: "tight", label: "긴축 경영", emoji: "🟢" },
    { key: "growth", label: "공격 투자", emoji: "🟡" },
    { key: "worst", label: "최악 (경기 침체)", emoji: "🔴" },
  ];

  const formatRunway = (r: number | null): string => {
    if (r === null) return "-";
    if (r >= 999) return "흑자 (무한)";
    if (r >= 12) return `${r.toFixed(1)}개월 (${(r / 12).toFixed(1)}년)`;
    return `${r.toFixed(1)}개월`;
  };

  const getStatusColor = (r: number | null): string => {
    if (r === null) return "text-muted-foreground";
    if (r >= 999) return "text-emerald-600 dark:text-emerald-400";
    if (r >= 18) return "text-emerald-600 dark:text-emerald-400";
    if (r >= 12) return "text-amber-600 dark:text-amber-400";
    if (r >= 6) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">⏳ Runway 4시나리오</CardTitle>
        <p className="text-xs text-muted-foreground">
          현재 현금으로 각 시나리오 하에서 버틸 수 있는 기간
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>시나리오</TableHead>
                <TableHead className="text-right">Runway</TableHead>
                <TableHead>가정</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ key, label, emoji }) => {
                const s = scenarios[key];
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium">
                      <span className="mr-1.5">{emoji}</span>
                      {label}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-semibold ${getStatusColor(s.runway)}`}
                    >
                      {formatRunway(s.runway)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.assumption}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="px-4 py-2 text-[11px] text-muted-foreground">
          판단 기준: <span className="text-emerald-600">18개월+</span> 안전 ·
          <span className="text-amber-600"> 12~18</span> 주의 ·
          <span className="text-orange-600"> 6~12</span> 경고 ·
          <span className="text-red-600"> 6미만</span> 심각
        </p>
      </CardContent>
    </Card>
  );
}
