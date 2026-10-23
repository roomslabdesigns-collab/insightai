// POST {opportunity: {theme, stats..., evidence: [{id, text}]}} -> {recommendation, usage}
// Turns a prioritised opportunity into a concrete, evidence-cited product recommendation for PM review.
import { NextResponse } from "next/server";
import { clip, fail, overLimit, tooMany } from "@/lib/server/guard";
import { chatJson } from "@/lib/server/llm";
import type { Recommendation } from "@/lib/types";

export const maxDuration = 60;

const SYSTEM = `You are a senior product manager. Turn one prioritised product opportunity into a recommendation.
Use ONLY the statistics and customer evidence given. Cite evidence ids. Be specific and practical.
Respond with JSON only:
{"title": "short action-oriented title",
 "problem": "1-2 sentences on the customer problem",
 "recommendation": "2-3 sentences on what to build or change",
 "expected_impact": "1 sentence, tied to the given numbers",
 "effort": "S" | "M" | "L",
 "success_metric": "one measurable metric to track",
 "risks": "1 sentence on risks or open questions",
 "evidence_ids": ["id", "..."]}`;

type Input = { theme: string; score: number; priority: string; evidence: number; accounts: number; revenue_at_risk?: number;
  high_severity_share: number; churn_mentions: number; trend?: number | null; product_areas?: string[]; quotes: { id: string; text: string }[] };

export async function POST(req: Request) {
  if (overLimit(req, "recommend")) return tooMany();
  try {
    const { opportunity: o } = (await req.json()) as { opportunity: Input };
    if (!o?.theme || !o.quotes?.length) return NextResponse.json({ error: "opportunity with quotes is required" }, { status: 400 });
    const quotes = o.quotes.slice(0, 12);
    const stats = [
      `Theme: ${clip(o.theme, 60)} (priority ${o.priority}, impact score ${o.score}/100)`,
      `Negative signals: ${o.evidence}; accounts affected: ${o.accounts}; high-severity share: ${o.high_severity_share}%`,
      `Churn mentions: ${o.churn_mentions}` + (o.revenue_at_risk ? `; revenue at risk: $${Math.round(o.revenue_at_risk)}` : ""),
      o.trend != null ? `Trend vs prior period: ${o.trend}%` : "",
      o.product_areas?.length ? `Product areas: ${o.product_areas.slice(0, 5).join(", ")}` : "",
    ].filter(Boolean).join("\n");
    const evidence = quotes.map((q) => `[${q.id}] ${clip(q.text, 400)}`).join("\n");
    const { data, usage } = await chatJson(SYSTEM, `${stats}\n\nCustomer evidence:\n${evidence}`, 3);

    const ids = new Set(quotes.map((q) => q.id));
    const r = data as unknown as Recommendation;
    const recommendation: Recommendation = {
      title: clip(r.title, 100),
      problem: clip(r.problem, 400),
      recommendation: clip(r.recommendation, 600),
      expected_impact: clip(r.expected_impact, 300),
      effort: (["S", "M", "L"] as const).includes(r.effort) ? r.effort : "M",
      success_metric: clip(r.success_metric, 200),
      risks: clip(r.risks, 300),
      evidence_ids: (Array.isArray(r.evidence_ids) ? r.evidence_ids : []).map(String).filter((i) => ids.has(i)),
    };
    return NextResponse.json({ recommendation, usage });
  } catch (e) {
    return fail(e);
  }
}
