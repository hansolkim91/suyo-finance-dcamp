"use client";

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
} from "recharts";
import type { FinancialData } from "@/lib/finance/types";
import {
  calcRunwayScenarios,
  calcBepReverse,
  calcCashPosition,
  calcBurnYoY,
} from "@/lib/finance/metrics/private";
import { ScoreGauge } from "./shared/ScoreGauge";
import { KpiMini } from "./shared/CategoryCard";
import { formatWon, formatChartAmount } from "./shared/format";
import type { ChecklistResult, YearMetrics } from "./shared/types";
import { CashPositionBar } from "./private/CashPositionBar";
import { RunwayScenarioTable } from "./private/RunwayScenarioTable";
import { BepReverseCard } from "./private/BepReverseCard";

/**
 * 비상장사 재무 분석 화면 — v4 (8섹션, VC 심사역 관점).
 *
 * 화면 구조:
 *  ① 비상장 분석 안내 박스 (파란 톤)
 *  ② 회사 한 줄 + 생존성 점수
 *  ③ 현금 포지션 (즉시가용/사용제한 스택바)
 *  ④ Burn Rate (Gross/Net/YoY)
 *  ⑤ Runway 4시나리오 표
 *  ⑥ BEP 역산 카드
 *  ⑦ 자본·차입 구조
 *  ⑧ AI 해설 (VC 심사역 톤)
 */

type Props = {
  result: ChecklistResult;
  metricsPerYear: YearMetrics[];
  financialData: FinancialData;
};

export function ResultViewPrivate({
  result,
  metricsPerYear,
  financialData,
}: Props) {
  const latest = financialData.years[0];
  const prior = financialData.years[1];

  if (!latest) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          재무 데이터를 찾을 수 없습니다.
        </CardContent>
      </Card>
    );
  }

  // 신규 지표 계산 (UI 진입 시점에 1회)
  const runwayScenarios = calcRunwayScenarios(latest);
  const bepReverse = calcBepReverse(latest);
  const cashPosition = calcCashPosition(latest);
  const burnYoY = prior ? calcBurnYoY(latest, prior) : null;

  // Burn Rate 월평균 계산
  const monthlyOpEx = latest.operatingExpenses
    ? Math.abs(latest.operatingExpenses) / 12
    : null;
  const monthlyRev = latest.revenue ? latest.revenue / 12 : 0;
  const grossBurn = monthlyOpEx;
  const netBurn =
    monthlyOpEx !== null ? Math.max(0, monthlyOpEx - monthlyRev) : null;

  // 자본 잠식 여부
  const isCapitalImpaired =
    latest.totalEquity !== null && latest.totalEquity < 0;

  // 부채 vs 자본 차트
  const debtEquityData = financialData.years
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

  // Burn YoY 상태 (Net Burn 기준)
  const burnYoyStatus: "good" | "neutral" | "warning" =
    burnYoY?.netBurnYoY === null || burnYoY?.netBurnYoY === undefined
      ? "neutral"
      : burnYoY.netBurnYoY <= 0
        ? "good"
        : burnYoY.netBurnYoY <= 20
          ? "neutral"
          : "warning";

  return (
    <div className="space-y-6">
      {/* ① 비상장 분석 안내 박스 */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
        <span className="font-semibold">💡 비상장 분석 관점:</span> 매출·이익보다
        <strong> 현금 잔고와 Runway를 중심으로 생존성</strong>을 평가합니다.
        외부 기장 재무제표 특성상 일부 항목이 누락될 수 있어, 중요한 숫자는 최신
        경영 자료로 교차 검증하는 것을 권장합니다.
      </div>

      {/* ② 회사명 + 생존성 점수 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {result.companyName}
            </h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              비상장 (스타트업)
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {result.summary}
          </p>
        </div>
        <div className="flex flex-col items-center">
          <ScoreGauge score={result.overallScore} />
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            생존성 점수
          </p>
        </div>
      </div>

      {/* AI 종합 의견 (상장과 동일 위치, 톤만 VC) */}
      <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="py-4">
          <p className="mb-1 text-sm font-semibold">
            💼 VC 관점 종합 의견
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {result.insight}
          </p>
        </CardContent>
      </Card>

      {/* ③ 현금 포지션 */}
      <CashPositionBar position={cashPosition} />

      {/* ④ Burn Rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🔥 Burn Rate</CardTitle>
          <p className="text-xs text-muted-foreground">
            월평균 현금 소진 속도 — 매출과 무관한 Gross vs 매출 차감 Net
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiMini
              label="Gross Burn (월)"
              value={grossBurn !== null ? formatWon(grossBurn) : "-"}
              status="neutral"
              sub={
                <span className="text-[10px] text-muted-foreground">
                  월평균 영업비용
                </span>
              }
            />
            <KpiMini
              label="Net Burn (월)"
              value={
                netBurn !== null
                  ? netBurn === 0
                    ? "흑자 (음수 Burn)"
                    : formatWon(netBurn)
                  : "-"
              }
              status={
                netBurn !== null && netBurn === 0
                  ? "good"
                  : netBurn !== null && netBurn > 0
                    ? "warning"
                    : "neutral"
              }
              sub={
                <span className="text-[10px] text-muted-foreground">
                  = Gross − 월매출
                </span>
              }
            />
            <KpiMini
              label="Net Burn YoY"
              value={
                burnYoY?.netBurnYoY !== null &&
                burnYoY?.netBurnYoY !== undefined
                  ? `${burnYoY.netBurnYoY > 0 ? "+" : ""}${burnYoY.netBurnYoY.toFixed(1)}%`
                  : "-"
              }
              status={burnYoyStatus}
              sub={
                burnYoY?.netBurnYoY !== null &&
                burnYoY?.netBurnYoY !== undefined ? (
                  <span
                    className={`text-[10px] ${
                      burnYoY.netBurnYoY > 0
                        ? "text-red-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {burnYoY.netBurnYoY > 0 ? "▲ 증가" : "▼ 감소"}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    전년 데이터 필요
                  </span>
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ⑤ Runway 4시나리오 */}
      <RunwayScenarioTable scenarios={runwayScenarios} />

      {/* ⑥ BEP 역산 */}
      <BepReverseCard bep={bepReverse} currentRevenue={latest.revenue} />

      {/* ⑦ 자본·차입 구조 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">🏦 자본·차입 구조</CardTitle>
            {isCapitalImpaired && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                ⚠️ 자본잠식
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            부채 vs 자본 추이 — 자본잠식 / 차입 의존도 판단
          </p>
        </CardHeader>
        <CardContent>
          {debtEquityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
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
                  maxBarSize={50}
                  stackId="a"
                />
                <Bar
                  dataKey="자본"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              부채·자본 데이터가 부족합니다
            </p>
          )}
        </CardContent>
      </Card>

      {/* ⑧ AI 카테고리별 해설 (metricsPerYear에 포함된 checklist 요약) */}
      {result.checklist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              🔍 VC 심사역 세부 진단 ({result.checklist.length}개 카테고리)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.checklist.map((item) => {
              const borderColor = {
                good: "border-l-emerald-500",
                neutral: "border-l-amber-400",
                warning: "border-l-red-500",
              }[item.status];
              return (
                <div
                  key={item.category}
                  className={`rounded-md border-l-4 bg-muted/30 p-3 ${borderColor}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-semibold">{item.category}</p>
                    <p className="text-[11px] text-muted-foreground">
                      출처: {item.source}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {item.keyItems}
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed">
                    {item.analysis}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* metricsPerYear는 현재 직접 사용하지 않음 (장래 Burn 추이 차트 등에 활용 가능) */}
      {metricsPerYear.length === 0 && null}
    </div>
  );
}
