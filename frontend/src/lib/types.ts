// Shared between the browser and the API routes.

export type Sentiment = "positive" | "neutral" | "negative";
export type Severity = "low" | "medium" | "high";
export const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];
export const SEVERITIES: Severity[] = ["low", "medium", "high"];
export const FEEDBACK_TYPES = ["bug report", "feature request", "complaint", "praise", "question"];
export const GENERAL_THEME = "General Feedback";

/** One cleaned feedback item, plus its LLM labels once enriched. */
export interface Row {
  id: string;
  text: string;
  date?: string;
  rating?: number;
  customer?: string;
  segment?: string;
  revenue?: number;
  source?: string;
  sentiment?: Sentiment;
  theme?: string;
  severity?: Severity;
  product_area?: string;
  feedback_type?: string;
  churn_risk?: boolean;
  summary?: string;
}

export interface Theme {
  name: string;
  description: string;
}

export interface Answer {
  insight: string;
  themes: string[];
  affected_segments: string[];
  severity: Severity;
  evidence_ids: string[];
  opportunity: string;
  confidence: "low" | "medium" | "high";
}

export interface AskResult {
  question: string;
  answer: Answer;
  evidence: (Row & { score: number; cited: boolean })[];
  review: { needs_human_review: boolean; reasons: string[] };
  meta: { latency_ms: number; retrieved: number; relevant: number; llm?: { provider: string; model: string; prompt_tokens?: number; completion_tokens?: number } };
}

export interface Recommendation {
  title: string;
  problem: string;
  recommendation: string;
  expected_impact: string;
  effort: "S" | "M" | "L";
  success_metric: string;
  risks: string;
  evidence_ids: string[];
}

/** Metadata stored with each vector in Pinecone, so search results carry the row itself. */
export function rowToMetadata(r: Row): Record<string, string | number | boolean> {
  const m: Record<string, string | number | boolean> = { text: r.text };
  for (const k of ["date", "customer", "segment", "source", "sentiment", "theme", "severity", "product_area", "feedback_type", "summary"] as const) {
    if (r[k] !== undefined && r[k] !== "") m[k] = r[k] as string;
  }
  if (r.rating !== undefined) m.rating = r.rating;
  if (r.revenue !== undefined) m.revenue = r.revenue;
  if (r.churn_risk !== undefined) m.churn_risk = r.churn_risk;
  return m;
}
