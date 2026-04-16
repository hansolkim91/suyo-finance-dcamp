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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
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

/**
 * 재무 분석 대시보드 v3 — "재무 선배" 스타일
 *
 * 핵심 원칙:
 * 1. 숫자 먼저, 해석 나중 (절대 금액 표 → AI 코멘트)
 * 2. 카테고리별 카드 분리 (표 한 줄이 아닌, 각각 독립 카드)
 * 3. 연도별 비교 (전년 대비 증감률 표시)
 * 4. 색상 신호등 (초록/노랑/빨강)
 */

// ── 타입 ──

export type ChecklistItem = {
  category: string;
  keyItems: string;
  source: string;
  analysis: string;
  status: "good" | "neutral" | "warning";
};

export type CategoryScores = {
  profitability: number;
  stability: number;
  growth: number;
  efficiency: number;
  cashflow: number;
};

export type ChecklistResult = {
  companyName: string;
  summary: string;
  insight: string;
  overallScore: number;
  categoryScores: CategoryScores;
  checklist: ChecklistItem[];
};

type Metric = {
  name: string;
  value: number | null;
  unit: string;
  description: string;
  category?: string;
};

type YearMetrics = {
  year: string;
  metrics: Metric[];
};

type ResultViewProps = {
  result: ChecklistResult;
  metricsPerYear: YearMetrics[];
  financialData: FinancialData;
  type: "listed" | "private";
};

// ── 유틸 ──

function formatWon(value: number | null): string {
  if (value === null) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000)
    return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}조`;
  if (abs >= 100_000_000)
    return `${sign}${Math.round(abs / 100_000_000).toLocaleString()}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString()}만`;
  return `${sign}${abs.toLocaleString()}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}배`;
}

function calcYoy(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function yoyBadge(yoy: number | null): React.ReactNode {
  if (yoy === null) return <span className="text-xs text-gray-400">-</span>;
  const isPositive = yoy > 0;
  const color = isPositive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  const arrow = isPositive ? "▲" : "▼";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {Math.abs(yoy).toFixed(1)}%
    </span>
  );
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreGradient(score: number): string {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "우수";
  if (score >= 70) return "양호";
  if (score >= 50) return "보통";
  if (score >= 40) return "미흡";
  return "위험";
}

type Status = "good" | "neutral" | "warning";

function statusDot(status: Status): React.ReactNode {
  const colors = {
    good: "bg-emerald-500",
    neutral: "bg-amber-400",
    warning: "bg-red-500",
  };
  const labels = { good: "양호", neutral: "보통", warning: "주의" };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />
      <span className="text-xs text-muted-foreground">{labels[status]}</span>
    </span>
  );
}

function getMetricStatus(name: string, value: number | null): Status {
  if (value === null) return "neutral";
  if (name.includes("영업이익률"))
    return value > 10 ? "good" : value >= 5 ? "neutral" : "warning";
  if (name.includes("순이익률"))
    return value > 7 ? "good" : value >= 3 ? "neutral" : "warning";
  if (name.includes("ROE"))
    return value > 15 ? "good" : value >= 10 ? "neutral" : "warning";
  if (name.includes("ROA"))
    return value > 5 ? "good" : value >= 2 ? "neutral" : "warning";
  if (name.includes("부채비율"))
    return value < 100 ? "good" : value <= 200 ? "neutral" : "warning";
  if (name.includes("자기자본비율"))
    return value > 50 ? "good" : value >= 30 ? "neutral" : "warning";
  if (name.includes("유동비율"))
    return value > 200 ? "good" : value >= 100 ? "neutral" : "warning";
  if (name.includes("이자보상배율"))
    return value > 3 ? "good" : value >= 1 ? "neutral" : "warning";
  if (name.includes("성장률"))
    return value > 10 ? "good" : value >= 0 ? "neutral" : "warning";
  if (name.includes("매출총이익률"))
    return value > 30 ? "good" : value >= 15 ? "neutral" : "warning";
  if (name.includes("EBITDA"))
    return value > 15 ? "good" : value >= 8 ? "neutral" : "warning";
  if (name.includes("Runway"))
    return value >= 18 ? "good" : value >= 6 ? "neutral" : "warning";
  return "neutral";
}

// ── 구역 1: 종합 점수 게이지 ──

function ScoreGauge({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const angle = (s / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const x = 100 + 80 * Math.cos(Math.PI - rad);
  const y = 100 - 80 * Math.sin(Math.PI - rad);
  const largeArc = angle > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="90" viewBox="0 0 200 110">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          className="text-muted/40"
          strokeLinecap="round"
        />
        {s > 0 && (
          <path
            d={`M 20 100 A 80 80 0 ${largeArc} 1 ${x.toFixed(1)} ${y.toFixed(1)}`}
            fill="none"
            stroke={getScoreGradient(s)}
            strokeWidth="12"
            strokeLinecap="round"
          />
        )}
        <text
          x="100"
          y="85"
          textAnchor="middle"
          fill={getScoreGradient(s)}
          style={{ fontSize: "36px", fontWeight: 700 }}
        >
          {s}
        </text>
        <text
          x="100"
          y="105"
          textAnchor="middle"
          fill="currentColor"
          className="text-muted-foreground"
          style={{ fontSize: "12px" }}
        >
          / 100
        </text>
      </svg>
      <span className={`mt-1 text-sm font-semibold ${getScoreColor(s)}`}>
        {getScoreLabel(s)}
      </span>
    </div>
  );
}

// ── 구역 3: 핵심 재무 요약표 ──

function FinancialSummaryTable({ data }: { data: FinancialData }) {
  const years = data.years;
  if (years.length === 0) return null;

  type Row = {
    label: string;
    key: keyof YearData;
    format: "won" | "percent";
  };

  const rows: Row[] = [
    { label: "매출액", key: "revenue", format: "won" },
    { label: "매출원가", key: "costOfGoodsSold", format: "won" },
    { label: "매출총이익", key: "grossProfit", format: "won" },
    { label: "영업이익", key: "operatingProfit", format: "won" },
    { label: "당기순이익", key: "netIncome", format: "won" },
    { label: "자산총계", key: "totalAssets", format: "won" },
    { label: "부채총계", key: "totalLiabilities", format: "won" },
    { label: "자본총계", key: "totalEquity", format: "won" },
    { label: "영업활동 현금흐름", key: "operatingCashFlow", format: "won" },
    { label: "현금·현금성자산", key: "cashBalance", format: "won" },
  ];

  // 값이 전부 null인 행은 숨김
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

// ── 구역 3-2: 매출·이익 추이 차트 ──

function RevenueProfitChart({ data }: { data: FinancialData }) {
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

  const hasProfit = chartData.some((d) => d.영업이익 !== null);
  const hasNetIncome = chartData.some((d) => d.당기순이익 !== null);
  const hasRevenue = chartData.some((d) => d.매출액 !== null);

  if (!hasRevenue) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">매출·이익 추이</CardTitle>
        <p className="text-xs text-muted-foreground">단위: 억원</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
              tickFormatter={(v) =>
                v >= 10000
                  ? `${(v / 10000).toFixed(0)}조`
                  : `${v.toLocaleString()}`
              }
            />
            <Tooltip
              formatter={(value) => [
                `${Number(value).toLocaleString()}억`,
                "",
              ]}
              contentStyle={{
                borderRadius: "8px",
                fontSize: "13px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
            <Bar
              dataKey="매출액"
              fill="#6366f1"
              radius={[6, 6, 0, 0]}
              maxBarSize={60}
            />
            {hasProfit && (
              <Line
                dataKey="영업이익"
                type="monotone"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#10b981" }}
                connectNulls
              />
            )}
            {hasNetIncome && (
              <Line
                dataKey="당기순이익"
                type="monotone"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#f59e0b" }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── 카테고리 카드 공통 ──

function CategoryCard({
  item,
  children,
}: {
  item: ChecklistItem;
  children?: React.ReactNode;
}) {
  const borderColor = {
    good: "border-l-emerald-500",
    neutral: "border-l-amber-400",
    warning: "border-l-red-500",
  };

  return (
    <Card className={`border-l-4 ${borderColor[item.status]}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{item.category}</CardTitle>
          {statusDot(item.status)}
        </div>
        <p className="text-xs text-muted-foreground">
          {item.keyItems} | 출처: {item.source}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {/* AI 해설 박스 */}
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">
            AI 분석
          </p>
          <p className="text-sm leading-relaxed">{item.analysis}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── KPI 미니 카드 ──

function KpiMini({
  label,
  value,
  status,
  sub,
}: {
  label: string;
  value: string;
  status: Status;
  sub?: React.ReactNode;
}) {
  const textColor = {
    good: "text-emerald-700 dark:text-emerald-400",
    neutral: "text-amber-700 dark:text-amber-400",
    warning: "text-red-700 dark:text-red-400",
  };

  return (
    <div className="rounded-lg border p-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${textColor[status]}`}>
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {statusDot(status)}
        {sub}
      </div>
    </div>
  );
}

// ── 구역 4-1: 사업모델 ──

function BusinessModelSection({
  item,
  data,
}: {
  item: ChecklistItem;
  data: FinancialData;
}) {
  const latest = data.years[0];
  if (!latest) return <CategoryCard item={item} />;

  const cogsRate =
    latest.costOfGoodsSold && latest.revenue
      ? (Math.abs(latest.costOfGoodsSold) / latest.revenue) * 100
      : null;
  const sgaRate =
    latest.sgaExpenses && latest.revenue
      ? (Math.abs(latest.sgaExpenses) / latest.revenue) * 100
      : null;
  const opExpRate =
    cogsRate !== null && sgaRate !== null ? cogsRate + sgaRate : null;

  return (
    <CategoryCard item={item}>
      <div className="grid grid-cols-3 gap-3">
        <KpiMini
          label="매출원가율"
          value={cogsRate !== null ? `${cogsRate.toFixed(1)}%` : "-"}
          status={
            cogsRate === null
              ? "neutral"
              : cogsRate < 60
                ? "good"
                : cogsRate < 80
                  ? "neutral"
                  : "warning"
          }
        />
        <KpiMini
          label="판관비율"
          value={sgaRate !== null ? `${sgaRate.toFixed(1)}%` : "-"}
          status={
            sgaRate === null
              ? "neutral"
              : sgaRate < 20
                ? "good"
                : sgaRate < 30
                  ? "neutral"
                  : "warning"
          }
        />
        <KpiMini
          label="영업비용률"
          value={opExpRate !== null ? `${opExpRate.toFixed(1)}%` : "-"}
          status={
            opExpRate === null
              ? "neutral"
              : opExpRate < 85
                ? "good"
                : opExpRate < 95
                  ? "neutral"
                  : "warning"
          }
        />
      </div>
    </CategoryCard>
  );
}

// ── 구역 4-2: 매출·이익 흐름 ──

function ProfitFlowSection({
  item,
  metricsPerYear,
}: {
  item: ChecklistItem;
  metricsPerYear: YearMetrics[];
}) {
  const profitMetricNames = [
    "매출총이익률",
    "영업이익률",
    "순이익률",
    "EBITDA 마진",
  ];
  const growthMetricNames = [
    "매출 성장률 (YoY)",
    "영업이익 성장률 (YoY)",
    "순이익 성장률 (YoY)",
  ];

  const latest = metricsPerYear[0]?.metrics ?? [];

  // 수익성 KPI
  const profitKpis = profitMetricNames
    .map((name) => latest.find((m) => m.name === name))
    .filter(Boolean) as Metric[];

  // 성장률
  const growthKpis = growthMetricNames
    .map((name) => latest.find((m) => m.name === name))
    .filter(Boolean) as Metric[];

  // 수익성 추이 차트 데이터
  const chartData = metricsPerYear
    .slice()
    .reverse()
    .map((ym) => {
      const row: Record<string, string | number> = { year: `${ym.year}년` };
      for (const m of ym.metrics) {
        if (profitMetricNames.includes(m.name) && m.value !== null) {
          row[m.name] = Math.round(m.value * 10) / 10;
        }
      }
      return row;
    });

  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#8b5cf6"];

  return (
    <CategoryCard item={item}>
      {/* 수익성 KPI */}
      {profitKpis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {profitKpis.map((m) => (
            <KpiMini
              key={m.name}
              label={m.name}
              value={formatPercent(m.value)}
              status={getMetricStatus(m.name, m.value)}
            />
          ))}
        </div>
      )}

      {/* 성장률 */}
      {growthKpis.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {growthKpis.map((m) => (
            <KpiMini
              key={m.name}
              label={m.name.replace(" (YoY)", "")}
              value={formatPercent(m.value)}
              status={getMetricStatus(m.name, m.value)}
              sub={
                m.value !== null ? (
                  <span
                    className={`text-xs ${m.value >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {m.value >= 0 ? "▲" : "▼"}
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {/* 수익성 추이 차트 */}
      {metricsPerYear.length > 1 && (
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
            {profitMetricNames.map((name, i) => {
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
    </CategoryCard>
  );
}

// ── 구역 4-3: 재무건전성 ──

function StabilitySection({
  item,
  metricsPerYear,
  data,
}: {
  item: ChecklistItem;
  metricsPerYear: YearMetrics[];
  data: FinancialData;
}) {
  const stabilityNames = [
    "부채비율",
    "자기자본비율",
    "유동비율",
    "이자보상배율",
  ];
  const latest = metricsPerYear[0]?.metrics ?? [];
  const kpis = stabilityNames
    .map((name) => latest.find((m) => m.name === name))
    .filter(Boolean) as Metric[];

  // 부채 vs 자본 차트
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
    <CategoryCard item={item}>
      {/* 안정성 KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((m) => (
          <KpiMini
            key={m.name}
            label={m.name}
            value={
              m.unit === "배" ? formatRatio(m.value) : formatPercent(m.value)
            }
            status={getMetricStatus(m.name, m.value)}
          />
        ))}
      </div>

      {/* 현금 현황 */}
      {data.years[0] && (
        <div className="grid grid-cols-2 gap-3">
          <KpiMini
            label="현금·현금성자산"
            value={formatWon(data.years[0].cashBalance)}
            status={
              data.years[0].cashBalance === null
                ? "neutral"
                : data.years[0].cashBalance > 0
                  ? "good"
                  : "warning"
            }
          />
          <KpiMini
            label="영업활동 현금흐름"
            value={formatWon(data.years[0].operatingCashFlow)}
            status={
              data.years[0].operatingCashFlow === null
                ? "neutral"
                : data.years[0].operatingCashFlow > 0
                  ? "good"
                  : "warning"
            }
          />
        </div>
      )}

      {/* 부채 vs 자본 차트 */}
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
              tickFormatter={(v) =>
                v >= 10000 ? `${(v / 10000).toFixed(0)}조` : `${v}억`
              }
            />
            <Tooltip
              formatter={(value) => [
                `${Number(value).toLocaleString()}억`,
                "",
              ]}
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
    </CategoryCard>
  );
}

// ── 구역 4-4: 리스크 신호 ──

function RiskSection({
  item,
  data,
  metricsPerYear,
}: {
  item: ChecklistItem;
  data: FinancialData;
  metricsPerYear: YearMetrics[];
}) {
  const latest = data.years[0];
  const prev = data.years[1];
  const latestMetrics = metricsPerYear[0]?.metrics ?? [];

  // 리스크 체크리스트 항목 자동 판단
  type RiskCheck = { label: string; isRisk: boolean | null; detail: string };
  const checks: RiskCheck[] = [];

  // 자본잠식
  if (latest?.totalEquity !== null && latest?.totalLiabilities !== null) {
    const isCapitalImpaired =
      latest.totalEquity !== null && latest.totalEquity < 0;
    checks.push({
      label: "자본잠식 징후",
      isRisk: isCapitalImpaired,
      detail: isCapitalImpaired
        ? `자본총계 ${formatWon(latest.totalEquity)} (음수)`
        : `자본총계 ${formatWon(latest.totalEquity)}`,
    });
  }

  // 부채 급증
  if (latest?.totalLiabilities !== null && prev?.totalLiabilities !== null) {
    const debtGrowth = calcYoy(latest.totalLiabilities, prev.totalLiabilities);
    checks.push({
      label: "부채 급증 (전년 대비 20% 이상)",
      isRisk: debtGrowth !== null && debtGrowth > 20,
      detail: debtGrowth !== null ? `전년 대비 ${debtGrowth.toFixed(1)}%` : "-",
    });
  }

  // 영업이익 적자
  if (latest?.operatingProfit !== null) {
    checks.push({
      label: "영업이익 적자",
      isRisk: latest.operatingProfit < 0,
      detail: `영업이익 ${formatWon(latest.operatingProfit)}`,
    });
  }

  // 이자보상배율
  const icr = latestMetrics.find((m) => m.name.includes("이자보상배율"));
  if (icr?.value !== null && icr !== undefined) {
    checks.push({
      label: "이자보상배율 1배 미만",
      isRisk: icr.value !== null && icr.value < 1,
      detail: `${formatRatio(icr.value)}`,
    });
  }

  // 현금흐름 적자
  if (latest?.operatingCashFlow !== null) {
    checks.push({
      label: "영업현금흐름 적자",
      isRisk:
        latest.operatingCashFlow !== null && latest.operatingCashFlow < 0,
      detail: `${formatWon(latest.operatingCashFlow)}`,
    });
  }

  return (
    <CategoryCard item={item}>
      <div className="space-y-2">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`flex items-center gap-3 rounded-lg border p-3 ${
              check.isRisk
                ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                : "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
            }`}
          >
            <span className="text-lg">
              {check.isRisk === null ? "⚪" : check.isRisk ? "⚠️" : "✅"}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium">{check.label}</p>
              <p className="text-xs text-muted-foreground">{check.detail}</p>
            </div>
          </div>
        ))}
        {checks.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            판단 가능한 데이터가 부족합니다
          </p>
        )}
      </div>
    </CategoryCard>
  );
}

// ── 구역 4-5: 비교·평가 ──

function EvaluationSection({
  item,
  metricsPerYear,
}: {
  item: ChecklistItem;
  metricsPerYear: YearMetrics[];
}) {
  const latest = metricsPerYear[0]?.metrics ?? [];
  const efficiencyNames = ["ROE (자기자본이익률)", "ROA (총자산이익률)"];
  const effKpis = efficiencyNames
    .map((name) => latest.find((m) => m.name === name))
    .filter(Boolean) as Metric[];

  return (
    <CategoryCard item={item}>
      <div className="grid grid-cols-2 gap-3">
        {effKpis.map((m) => (
          <KpiMini
            key={m.name}
            label={m.name}
            value={formatPercent(m.value)}
            status={getMetricStatus(m.name, m.value)}
          />
        ))}
      </div>
    </CategoryCard>
  );
}

// ── 구역 5: 레이더 차트 ──

function CategoryRadar({ scores }: { scores: CategoryScores }) {
  const radarData = [
    { category: "수익성", score: scores.profitability },
    { category: "안정성", score: scores.stability },
    { category: "성장성", score: scores.growth },
    { category: "효율성", score: scores.efficiency },
    { category: "현금창출력", score: scores.cashflow },
  ];

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">카테고리별 종합 점수</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="var(--color-muted)" />
            <PolarAngleAxis
              dataKey="category"
              tick={{ fontSize: 13, fill: "var(--color-foreground)" }}
            />
            <Radar
              dataKey="score"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
        {/* 점수 표 */}
        <div className="mt-2 grid grid-cols-5 gap-2 text-center">
          {radarData.map((d) => (
            <div key={d.category}>
              <p className="text-xs text-muted-foreground">{d.category}</p>
              <p className={`text-lg font-bold ${getScoreColor(d.score)}`}>
                {d.score}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── 메인 컴포넌트 ──

export function ResultView({
  result,
  metricsPerYear,
  financialData,
  type,
}: ResultViewProps) {
  const typeLabel = type === "listed" ? "상장사" : "비상장사";

  // 체크리스트 아이템 매핑
  const findItem = (keyword: string) =>
    result.checklist.find((c) => c.category.includes(keyword));

  const businessItem = findItem("사업모델");
  const profitItem =
    findItem("매출") || findItem("이익") || findItem("현금 소진");
  const stabilityItem = findItem("재무건전") || findItem("손익");
  const riskItem = findItem("리스크");
  const evalItem = findItem("비교") || findItem("평가") || findItem("기회");

  return (
    <div className="space-y-6">
      {/* ── 1. 헤더 + 종합 점수 ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {result.companyName}
            </h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {typeLabel}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {result.summary}
          </p>
        </div>
        <ScoreGauge score={result.overallScore} />
      </div>

      {/* ── 2. AI 종합 인사이트 ── */}
      <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="py-4">
          <p className="mb-1 text-sm font-semibold">AI 종합 의견</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {result.insight}
          </p>
        </CardContent>
      </Card>

      {/* ── 3. 핵심 재무 요약표 + 매출·이익 차트 ── */}
      <FinancialSummaryTable data={financialData} />
      <RevenueProfitChart data={financialData} />

      {/* ── 4. 카테고리별 상세 분석 ── */}
      {businessItem && (
        <BusinessModelSection item={businessItem} data={financialData} />
      )}
      {profitItem && (
        <ProfitFlowSection
          item={profitItem}
          metricsPerYear={metricsPerYear}
        />
      )}
      {stabilityItem && (
        <StabilitySection
          item={stabilityItem}
          metricsPerYear={metricsPerYear}
          data={financialData}
        />
      )}
      {riskItem && (
        <RiskSection
          item={riskItem}
          data={financialData}
          metricsPerYear={metricsPerYear}
        />
      )}
      {evalItem && (
        <EvaluationSection item={evalItem} metricsPerYear={metricsPerYear} />
      )}

      {/* ── 5. 레이더 차트 ── */}
      <CategoryRadar scores={result.categoryScores} />
    </div>
  );
}
