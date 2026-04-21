import { getScoreColor, getScoreGradient, getScoreLabel } from "./badges";

/**
 * 종합 점수 반원 게이지 (0~100).
 */
export function ScoreGauge({ score }: { score: number }) {
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
