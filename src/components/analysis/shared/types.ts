/**
 * 분석 화면(상장/비상장) 공통 타입.
 *
 * AnalysisPanel.tsx가 ChecklistResult를 import해서 쓰므로
 * ResultView.tsx에서 re-export 유지.
 */

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

export type Metric = {
  name: string;
  value: number | null;
  unit: string;
  description: string;
  category?: string;
};

export type YearMetrics = {
  year: string;
  metrics: Metric[];
};

export type Status = "good" | "neutral" | "warning";
