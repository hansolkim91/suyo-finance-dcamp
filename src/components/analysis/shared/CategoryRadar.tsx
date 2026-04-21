import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { getScoreColor } from "./badges";
import type { CategoryScores } from "./types";

/**
 * 카테고리별 종합 점수 레이더 차트.
 * 5축: 수익성 / 안정성 / 성장성 / 효율성 / 현금창출력
 */
export function CategoryRadar({ scores }: { scores: CategoryScores }) {
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
