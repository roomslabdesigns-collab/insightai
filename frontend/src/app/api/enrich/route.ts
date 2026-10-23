// POST {themes: string[], rows: [{id, text, rating?}]} (max 40) -> {labels: {[id]: labels}, usage}
import { NextResponse } from "next/server";
import { clip, fail, overLimit, tooMany } from "@/lib/server/guard";
import { chatJson } from "@/lib/server/llm";
import { FEEDBACK_TYPES, GENERAL_THEME, SENTIMENTS, SEVERITIES } from "@/lib/types";

export const maxDuration = 60;

const system = (themes: string[]) => `You label customer feedback for a product team.
For EACH item return:
- sentiment: one of ${JSON.stringify(SENTIMENTS)}
- theme: exactly one of ${JSON.stringify(themes)}
- severity: one of ${JSON.stringify(SEVERITIES)}. high = broken core flow, data loss, outage, or the customer threatens to leave;
  medium = clear defect or strong frustration; low = minor, cosmetic, or praise
- product_area: the product area involved, 1-3 words (e.g. "Billing", "Search", "Mobile app")
- type: one of ${JSON.stringify(FEEDBACK_TYPES)}
- churn_risk: true only if the customer says they will cancel, leave, switch, or stop using the product
- summary: at most 12 words describing the core issue or praise
Respond with JSON only: {"items": [{"id": "...", "sentiment": "...", "theme": "...", "severity": "...",
"product_area": "...", "type": "...", "churn_risk": false, "summary": "..."}]}`;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.find((a) => a.toLowerCase() === String(v ?? "").trim().toLowerCase()) ?? fallback;

export async function POST(req: Request) {
  if (overLimit(req, "enrich")) return tooMany();
  try {
    const body = (await req.json()) as { themes: string[]; rows: { id: string; text: string; rating?: number }[] };
    const themes = (body.themes || []).map((t) => clip(t, 40)).slice(0, 10);
    const rows = (body.rows || []).slice(0, 40);
    if (!themes.length || !rows.length) return NextResponse.json({ error: "themes and rows are required" }, { status: 400 });

    const payload = rows.map((r) => ({ id: r.id, ...(r.rating !== undefined ? { rating: r.rating } : {}), text: clip(r.text, 600) }));
    const { data, usage } = await chatJson(system(themes), JSON.stringify(payload));
    const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
    const byId = new Map(items.map((i) => [String(i.id), i]));

    const labels: Record<string, unknown> = {};
    for (const r of rows) {
      const i = byId.get(r.id);
      if (!i) continue; // missing from the reply: the client retries it
      labels[r.id] = {
        sentiment: oneOf(i.sentiment, SENTIMENTS, "neutral"),
        theme: oneOf(i.theme, themes, GENERAL_THEME),
        severity: oneOf(i.severity, SEVERITIES, "low"),
        product_area: clip(i.product_area, 40),
        feedback_type: oneOf(i.type, FEEDBACK_TYPES, "complaint"),
        churn_risk: i.churn_risk === true,
        summary: clip(i.summary, 120),
      };
    }
    return NextResponse.json({ labels, usage });
  } catch (e) {
    return fail(e);
  }
}
