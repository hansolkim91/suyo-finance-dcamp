"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 지표를 시각적으로 비교하는 차트 컴포넌트.
 * 상장사: 수익성 + 안정성 + 효율성 차트
 * 비상장사: Burn Rate 차트
 *
 * 개선 사항:
 * - 더 세련된 색상 팔레트 (파스텔 + 채도 균형)
 * - 한국어 라벨, 둥근 모서리 바, 그리드 스타일 개선
 */

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

type MetricsChartProps = {
  metricsPerYear: YearMetrics[];
  type: "listed" | "private";
};

// 세련된 색상 팔레트 (접근성 고려)
const COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
];

// 공통: 지표 이름 목록으로 차트 데이터 생성
function buildChartData(
  metricsPerYear: YearMetrics[],
  metricNames: string[],
  convertBurn = false
): Record<string, string | number>[] {
  return metricsPerYear
    .slice()
    .reverse()
    .map((yearMetrics) => {
      const row: Record<string, string | number> = {
        year: `${yearMetrics.year}년`,
      };
      for (const metric of yearMetrics.metrics) {
        if (metricNames.includes(metric.name) && metric.value !== null) {
          if (convertBurn && metric.unit === "원/월") {
            row[metric.name] =
              Math.round((metric.value / 100_000_000) * 10) / 10;
          } else {
            row[metric.name] = Math.round(metric.value * 10) / 10;
          }
        }
      }
      return row;
    });
}

function ChartCard({
  title,
  subtitle,
  data,
  metricNames,
}: {
  title: string;
  subtitle?: string;
  data: Record<string, string | number>[];
  metricNames: string[];
}) {
  // 데이터가 있는 지표만 필터링
  const activeNames = metricNames.filter((name) =>
    data.some((row) => row[name] !== undefined)
  );
  if (activeNames.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
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
              axisLine={{ stroke: "var(--color-muted)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid var(--color-border)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                fontSize: "13px",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            />
            {activeNames.map((name, i) => (
              <Bar
                key={name}
                dataKey={name}
                fill={COLORS[i % COLORS.length]}
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function MetricsChart({ metricsPerYear, type }: MetricsChartProps) {
  if (metricsPerYear.length === 0) return null;

  if (type === "listed") {
    const profitNames = [
      "매출총이익률",
      "영업이익률",
      "순이익률",
      "EBITDA 마진",
    ];
    const stabilityNames = ["부채비율", "자기자본비율", "유동비율"];
    const efficiencyNames = ["ROE (자기자본이익률)", "ROA (총자산이익률)"];

    const profitData = buildChartData(metricsPerYear, profitNames);
    const stabilityData = buildChartData(metricsPerYear, stabilityNames);
    const efficiencyData = buildChartData(metricsPerYear, efficiencyNames);

    return (
      <div className="space-y-5">
        <h3 className="text-lg font-semibold tracking-tight">
          시각화 차트
        </h3>
        <ChartCard
          title="수익성 지표"
          subtitle="매출 대비 각 이익 단계의 비율 (%)"
          data={profitData}
          metricNames={profitNames}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <ChartCard
            title="재무 안정성"
            subtitle="부채와 자본의 균형 (%)"
            data={stabilityData}
            metricNames={stabilityNames}
          />
          <ChartCard
            title="자본 효율성"
            subtitle="투자된 자본 대비 수익률 (%)"
            data={efficiencyData}
            metricNames={efficiencyNames}
          />
        </div>
      </div>
    );
  }

  // 비상장사
  const burnNames = ["Gross Burn Rate", "Net Burn Rate"];
  const burnData = buildChartData(metricsPerYear, burnNames, true);

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold tracking-tight">
        시각화 차트
      </h3>
      <ChartCard
        title="월간 자금 소진"
        subtitle="월 평균 지출 규모 (억원)"
        data={burnData}
        metricNames={burnNames}
      />
    </div>
  );
}
