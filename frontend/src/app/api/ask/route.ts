// POST {namespace, question, filters?} -> AskResult.
// RAG: embed the question -> vector search in this dataset's namespace -> grounded JSON answer ->
// drop citations that weren't retrieved -> flag answers that need PM review.
import { NextResponse } from "next/server";
import { clip, fail, overLimit, tooMany } from "@/lib/server/guard";
import { chatJson } from "@/lib/server/llm";
import { embed, query } from "@/lib/server/pinecone";
import type { Answer, AskResult, Row } from "@/lib/types";

export const maxDuration = 60;

const TOP_K = 10;
const MIN_EVIDENCE = 3;
// Cosine similarity (llama-text-embed-v2) above which a result counts as "on topic".
// Calibrated on test questions: clearly relevant short reviews score ~0.25-0.45.
const RELEVANCE = Number(process.env.RELEVANCE_THRESHOLD || 0.22);

const SYSTEM = `You are InsightAI, a product-feedback analyst for product managers.
Rules:
- Use ONLY the customer feedback provided. Never invent facts, numbers, or quotes.
- Cite evidence by its id. Every claim must be backed by at least one cited id.
- If the feedback does not answer the question, say so and set confidence to "low".
- Be concise and specific. Do not generalise from one item to all customers.
Respond with JSON only:
{"insight": "2-4 sentence answer",
 "themes": ["main themes involved"],
 "affected_segments": ["customer segments involved, if the data has them"],
 "severity": "low" | "medium" | "high",
 "evidence_ids": ["id", "..."],
 "opportunity": "one concrete product action this suggests",
 "confidence": "low" | "medium" | "high"}`;

function reviewFlags(a: Answer, evidence: Row[], relevant: number, cited: string[]): string[] {
  const reasons: string[] = [];
  if (relevant < MIN_EVIDENCE) reasons.push(`Insufficient evidence: only ${relevant} strongly relevant items found.`);
  const pos = evidence.filter((e) => e.sentiment === "positive").length;
  const neg = evidence.filter((e) => e.sentiment === "negative").length;
  if (evidence.length && Math.min(pos, neg) / evidence.length >= 0.3) reasons.push("Conflicting feedback: evidence is split between positive and negative.");
  if (a.confidence === "low") reasons.push("Low model confidence.");
  if (cited.length < 2) reasons.push("Weak evidence: fewer than 2 items cited.");
  const revenue = new Map<string, number>();
  for (const e of evidence) if (cited.includes(e.id) && e.revenue) revenue.set(e.customer || e.id, e.revenue);
  const total = [...revenue.values()].reduce((s, v) => s + v, 0);
  if (a.severity === "high" && total >= 200_000) reasons.push(`High-impact recommendation: $${Math.round(total / 1000)}K revenue in cited accounts.`);
  return reasons;
}

export async function POST(req: Request) {
  if (overLimit(req, "ask")) return tooMany();
  const t0 = Date.now();
  try {
    const { namespace, question, filters } = (await req.json()) as { namespace: string; question: string; filters?: Record<string, string> };
    const q = clip(question, 500).trim();
    if (!namespace || q.length < 3) return NextResponse.json({ error: "namespace and question are required" }, { status: 400 });

    const [vector] = await embed([q], "query");
    const filter = filters && Object.keys(filters).length ? Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, { $eq: v }])) : undefined;
    const matches = await query(namespace, vector, TOP_K, filter);
    const evidence = matches.map((m) => ({ ...(m.metadata as unknown as Row), id: m.id, score: Math.round(m.score * 1000) / 1000 }));
    const relevant = evidence.filter((e) => e.score >= RELEVANCE).length;

    if (!evidence.length) {
      const empty: AskResult = {
        question: q,
        answer: { insight: "No relevant feedback was found for this question.", themes: [], affected_segments: [], severity: "low", evidence_ids: [], opportunity: "", confidence: "low" },
        evidence: [],
        review: { needs_human_review: true, reasons: ["No relevant feedback found."] },
        meta: { latency_ms: Date.now() - t0, retrieved: 0, relevant: 0 },
      };
      return NextResponse.json(empty);
    }

    const block = evidence
      .map((e) => {
        const tags = [e.rating !== undefined ? `${e.rating}★` : "", e.sentiment, e.theme, e.severity, e.segment, e.date].filter(Boolean).join(", ");
        return `[${e.id}] (${tags}) ${clip(e.text, 500)}`;
      })
      .join("\n");
    const { data, usage } = await chatJson(SYSTEM, `Question: ${q}\n\nCustomer feedback:\n${block}`, 3);
    const answer = data as unknown as Answer;
    const ids = new Set(evidence.map((e) => e.id));
    const cited = (Array.isArray(answer.evidence_ids) ? answer.evidence_ids : []).map(String).filter((i) => ids.has(i));
    answer.evidence_ids = cited;
    answer.themes = Array.isArray(answer.themes) ? answer.themes : [];
    answer.affected_segments = Array.isArray(answer.affected_segments) ? answer.affected_segments : [];
    answer.confidence = answer.confidence || "low";
    const reasons = reviewFlags(answer, evidence, relevant, cited);

    const result: AskResult = {
      question: q,
      answer,
      evidence: evidence.map((e) => ({ ...e, cited: cited.includes(e.id) })),
      review: { needs_human_review: reasons.length > 0, reasons },
      meta: { latency_ms: Date.now() - t0, retrieved: evidence.length, relevant, llm: usage },
    };
    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}
