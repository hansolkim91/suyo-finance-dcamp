"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";
import type { FinancialData, YearData } from "@/lib/finance/types";
import {
  CATEGORY_METRICS,
  METRIC_DESCRIPTIONS,
  THRESHOLDS,
  getSignalStatus,
} from "@/lib/finance/thresholds";
import { ScoreGauge } from "./shared/ScoreGauge";
import { CategoryRadar } from "./shared/CategoryRadar";
import { InfoTooltip } from "./shared/InfoTooltip";
import {
  formatWon,
  formatPercent,
  calcYoy,
  formatChartAmount,
} from "./shared/format";
import { yoyBadge } from "./shared/badges";
import type { ChecklistResult, YearMetrics } from "./shared/types";
import { ValuationCard } from "./listed/ValuationCard";
import { PeerComparisonTable } from "./listed/PeerComparisonTable";

/**
 * 상장사 재무 분석 화면 — v4 (4섹션 + 밸류에이션 + 동종비교).
 *
 * 핵심 원칙 (Plan v4):
 *  1) 차트=숫자: 차트가 보여주는 숫자를 별도 KPI 카드로 중복 표시 금지
 *  2) 각 지표는 화면에서 1회만 노출
 *  3) 절대 금액은 핵심 재무 요약표 1군데, 비율은 4섹션 표/차트에서
 */

type ResultViewListedProps = {
  result: ChecklistResult;
  metricsPerYear: YearMetrics[];
  financialData: FinancialData;
};

// ────────────────────────────────────────────────
// 핵심 재무 요약표 (절대 금액 — 1회만)
// ────────────────────────────────────────────────
function FinancialSummaryTable({ data }: { data: FinancialData }) {
  const years = data.years;
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
                    {i === 0 && years.length > 1 && (
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
                const latestVal = years[0]?.[row.key] as number | null;
                const prevVal = years[1]?.[row.key] as number | null;
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

// ────────────────────────────────────────────────
// 신호등 배지 (status → 컬러 칩)
// ────────────────────────────────────────────────
function StatusChip({ status }: { status: "good" | "neutral" | "warning" }) {
  const cfg = {
    good: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", label: "양호" },
    neutral: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", label: "보통" },
    warning: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-400", label: "주의" },
  }[status];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ────────────────────────────────────────────────
// 카테고리 지표 표 (성장/수익/안정/유동에서 공통 사용)
// 각 지표를 연도별로 보여주고 신호등 배지
// ────────────────────────────────────────────────
function CategoryMetricsTable({
  metricsPerYear,
  metricNames,
  unit = "%",
}: {
  metricsPerYear: YearMetrics[];
  metricNames: string[];
  unit?: string;
}) {
  const visible = metricNames.filter((name) =>
    metricsPerYear.some((ym) =>
      ym.metrics.some((m) => m.name === name && m.value !== null)
    )
  );
  if (visible.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px] sticky left-0 bg-background z-10">
              지표
            </TableHead>
            {metricsPerYear.map((ym, i) => (
              <TableHead key={ym.year} className="text-right">
                {ym.year}년
                {i === 0 && metricsPerYear.length > 1 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    (최신)
                  </span>
                )}
              </TableHead>
            ))}
            <TableHead className="text-center w-[60px]">상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((name) => {
            const latestMetric = metricsPerYear[0]?.metrics.find(
              (m) => m.name === name
            );
            const status = getSignalStatus(name, latestMetric?.value ?? null);
            const displayUnit = latestMetric?.unit ?? unit;
            // 호버 도움말 — thresholds.ts의 명시 매핑 우선, 없으면 metric description 폴백
            const description =
              METRIC_DESCRIPTIONS[name] ?? latestMetric?.description ?? name;

            return (
              <TableRow key={name}>
                <TableCell className="font-medium sticky left-0 bg-background z-10 overflow-visible">
                  <InfoTooltip label={name} description={description} />
                </TableCell>
                {metricsPerYear.map((ym) => {
                  const m = ym.metrics.find((mm) => mm.name === name);
                  return (
                    <TableCell
                      key={ym.year}
                      className="text-right tabular-nums"
                    >
                      {m?.value !== null && m?.value !== undefined
                        ? `${m.value.toFixed(1)}${displayUnit}`
                        : "-"}
                    </TableCell>
                  );
                })}
                <TableCell className="text-center">
                  <StatusChip status={status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ────────────────────────────────────────────────
// 성장성 — 매출/영업이익/순이익 콤보 차트만 (숫자는 차트에서)
// ────────────────────────────────────────────────
function GrowthSection({
  data,
  metricsPerYear,
}: {
  data: FinancialData;
  metricsPerYear: YearMetrics[];
}) {
  const chartData = data.years
    .slice()
    .reverse()
    .map((y) => ({
      year: `${y.year}년`,
      매출액: y.revenue ? Math.round(y.revenue / 100_000_000) : null,
      영업이익: y.operatingProfit
        ? Math.round(y.operatingProfit / 100_000_000)
        : null,
      당기순이익: y.netIncome
        ? Math.round(y.netIncome / 100_000_000)
        : null,
    }));
  const hasRevenue = chartData.some((d) => d.매출액 !== null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">📈 성장성</CardTitle>
        <p className="text-xs text-muted-foreground">
          매출·이익 절대 추이 + YoY 성장률
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasRevenue && (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-muted)"
                opacity={0.5}
              />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 13, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={60}
                tickFormatter={formatChartAmount}
              />
              <Tooltip
                formatter={(value) => [formatChartAmount(Number(value)), ""]}
                contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
              <Bar
                dataKey="매출액"
                fill="#6366f1"
                radius={[6, 6, 0, 0]}
                maxBarSize={60}
              />
              <Line
                dataKey="영업이익"
                type="monotone"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#10b981" }}
                connectNulls
              />
              <Line
                dataKey="당기순이익"
                type="monotone"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#f59e0b" }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {/* YoY 성장률 표 — 차트에서 보이지 않는 % 정보 */}
        <CategoryMetricsTable
          metricsPerYear={metricsPerYear}
          metricNames={CATEGORY_METRICS.성장성}
        />
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────
// 수익성 — 마진 추이 라인 차트 + 수익성 비율 표
// ────────────────────────────────────────────────
function ProfitabilitySection({
  metricsPerYear,
}: {
  metricsPerYear: YearMetrics[];
}) {
  const lineMetricNames = ["매출총이익률", "영업이익률", "순이익률"];
  const chartData = metricsPerYear
    .slice()
    .reverse()
    .map((ym) => {
      const row: Record<string, string | number> = { year: `${ym.year}년` };
      for (const m of ym.metrics) {
        if (lineMetricNames.includes(m.name) && m.value !== null) {
          row[m.name] = Math.round(m.value * 10) / 10;
        }
      }
      return row;
    });
  const hasChart =
    chartData.length > 0 &&
    lineMetricNames.some((n) => chartData.some((d) => d[n] !== undefined));
  const COLORS = ["#6366f1", "#10b981", "#f59e0b"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">💰 수익성</CardTitle>
        <p className="text-xs text-muted-foreground">
          마진 추이 + ROE/ROA 등 수익성 지표
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasChart && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-muted)"
                opacity={0.5}
              />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, ""]}
                contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {lineMetricNames.map((name, i) => {
                if (!chartData.some((d) => d[name] !== undefined)) return null;
                return (
                  <Line
                    key={name}
                    dataKey={name}
                    type="monotone"
                    stroke={COLORS[i]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
        {/* 수익성 표 — 차트에 없는 ROE/ROA/EBITDA마진/매출원가율 등도 포함 */}
        <CategoryMetricsTable
          metricsPerYear={metricsPerYear}
          metricNames={CATEGORY_METRICS.수익성}
        />
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────
// 안정성 — 안정성 비율 표 + 부채 vs 자본 스택바
// ────────────────────────────────────────────────
function StabilitySection({
  data,
  metricsPerYear,
}: {
  data: FinancialData;
  metricsPerYear: YearMetrics[];
}) {
  const debtEquityData = data.years
    .slice()
    .reverse()
    .filter((y) => y.totalLiabilities !== null || y.totalEquity !== null)
    .map((y) => ({
      year: `${y.year}년`,
      부채: y.totalLiabilities
        ? Math.round(y.totalLiabilities / 100_000_000)
        : 0,
      자본: y.totalEquity ? Math.round(y.totalEquity / 100_000_000) : 0,
    }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">🛡️ 안정성</CardTitle>
        <p className="text-xs text-muted-foreground">
          부채비율·자기자본비율 + 자본 구조 추이
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <CategoryMetricsTable
          metricsPerYear={metricsPerYear}
          metricNames={CATEGORY_METRICS.안정성}
        />
        {debtEquityData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={debtEquityData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-muted)"
                opacity={0.5}
              />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={55}
                tickFormatter={formatChartAmount}
              />
              <Tooltip
                formatter={(value) => [formatChartAmount(Number(value)), ""]}
                contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar
                dataKey="부채"
                fill="#ef4444"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                stackId="a"
              />
              <Bar
                dataKey="자본"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                stackId="a"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────
// 유동성 — 유동비율·당좌비율·현금비율
// ────────────────────────────────────────────────
function LiquiditySection({
  metricsPerYear,
}: {
  metricsPerYear: YearMetrics[];
}) {
  const latest = metricsPerYear[0]?.metrics ?? [];
  const liqMetrics = CATEGORY_METRICS.유동성
    .map((name) => latest.find((m) => m.name === name))
    .filter((m): m is NonNullable<typeof m> => m !== undefined && m.value !== null);

  const chartData = liqMetrics.map((m) => ({
    name: m.name,
    값: Math.round((m.value ?? 0) * 10) / 10,
    threshold: THRESHOLDS[m.name]?.good ?? 0,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">💧 유동성</CardTitle>
        <p className="text-xs text-muted-foreground">
          단기 지급능력 — 유동비율·당좌비율·현금비율
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-muted)"
                opacity={0.5}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={45}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, ""]}
                contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
              />
              <Bar
                dataKey="값"
                fill="#0ea5e9"
                radius={[6, 6, 0, 0]}
                maxBarSize={70}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        <CategoryMetricsTable
          metricsPerYear={metricsPerYear}
          metricNames={CATEGORY_METRICS.유동성}
        />
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────
export function ResultViewListed({
  result,
  metricsPerYear,
  financialData,
}: ResultViewListedProps) {
  const stockCode = financialData.stockCode;

  return (
    <div className="space-y-6">
      {/* ① 헤더 + 종합 점수 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {result.companyName}
            </h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              상장사
            </span>
            {stockCode && (
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                {stockCode}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {result.summary}
          </p>
        </div>
        <ScoreGauge score={result.overallScore} />
      </div>

      {/* ② AI 종합 의견 */}
      <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="py-4">
          <p className="mb-1 text-sm font-semibold">AI 종합 의견</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {result.insight}
          </p>
        </CardContent>
      </Card>

      {/* ③ 핵심 재무 요약표 (1회만) */}
      <FinancialSummaryTable data={financialData} />

      {/* ④ 4섹션 카드 */}
      <GrowthSection data={financialData} metricsPerYear={metricsPerYear} />
      <ProfitabilitySection metricsPerYear={metricsPerYear} />
      <StabilitySection
        data={financialData}
        metricsPerYear={metricsPerYear}
      />
      <LiquiditySection metricsPerYear={metricsPerYear} />

      {/* ⑤ 밸류에이션 (상장사만) */}
      <ValuationCard
        stockCode={stockCode}
        financialData={financialData}
      />

      {/* ⑥ 동종업계 비교 */}
      <PeerComparisonTable
        thisStockCode={stockCode}
        thisFinancialData={financialData}
        peerSuggestions={financialData.peerSuggestions}
      />

      {/* ⑦ 카테고리 레이더 */}
      <CategoryRadar scores={result.categoryScores} />
    </div>
  );
}
