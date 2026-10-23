"use client";

import clsx from "clsx";
import { Check, CircleHelp, Loader2, Quote, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, Loading, NeedsData, PageHeader, priorityTone, type Tone } from "@/components/ui";
import { opportunities, type Opportunity } from "@/lib/analytics";
import { money } from "@/lib/format";
import { post } from "@/lib/pipeline";
import { useStore, type ReviewStatus } from "@/lib/store";
import type { Recommendation } from "@/lib/types";

const MAX = 6;
const STATUS: Record<ReviewStatus, { label: string; tone: Tone; icon: typeof Check }> = {
  approved: { label: "Approved", tone: "good", icon: Check },
  needs_evidence: { label: "Needs more evidence", tone: "warn", icon: CircleHelp },
  rejected: { label: "Rejected", tone: "bad", icon: X },
};

export default function Recommendations() {
  const { dataset, ready, reviews, updateReview } = useStore();
  const opps = useMemo(() => (dataset ? opportunities(dataset.rows).slice(0, MAX) : []), [dataset]);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!ready) return <Loading />;
  if (!dataset) return <NeedsData />;

  async function generate(o: Opportunity) {
    setBusy(o.theme);
    setErrors((e) => ({ ...e, [o.theme]: "" }));
    try {
      const { recommendation } = await post<{ recommendation: Recommendation }>("/api/recommend", {
        opportunity: {
          theme: o.theme, score: o.score, priority: o.priority, evidence: o.evidence, accounts: o.accounts,
          revenue_at_risk: o.revenue_at_risk || undefined, high_severity_share: o.high_severity_share,
          churn_mentions: o.churn_mentions, trend: o.trend, product_areas: o.product_areas,
          quotes: o.top_evidence.map((r) => ({ id: r.id, text: r.text })),
        },
      });
      updateReview(o.theme, { recommendation });
    } catch (e) {
      setErrors((x) => ({ ...x, [o.theme]: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  }

  async function generateAll() {
    for (const o of opps) if (!reviews[o.theme]?.recommendation) await generate(o);
  }

  const byId = new Map(dataset.rows.map((r) => [r.id, r]));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Recommendations & PM Review"
        subtitle="AI-drafted product recommendations for the top opportunities. A PM approves, rejects, or asks for more evidence."
        right={
          <button onClick={generateAll} disabled={!!busy} className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Generate all
          </button>
        }
      />
      {opps.length === 0 && <Card className="p-6 text-sm text-muted">No opportunities found in this dataset.</Card>}
      <div className="space-y-4">
        {opps.map((o) => {
          const review = reviews[o.theme] || {};
          const rec = review.recommendation;
          const status = review.status ? STATUS[review.status] : null;
          return (
            <Card key={o.theme} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
                <span className="font-semibold">{o.theme}</span>
                <Badge tone={priorityTone(o.priority)}>{o.priority}</Badge>
                <span className="font-mono text-xs text-muted">score {o.score} · {o.evidence} signals{o.revenue_at_risk ? ` · ${money(o.revenue_at_risk)}` : ""}</span>
                {status && <Badge tone={status.tone} className="ml-auto">{status.label}</Badge>}
              </div>

              {!rec ? (
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => generate(o)} disabled={!!busy} className="flex items-center gap-2 rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent-2 hover:bg-accent/10 disabled:opacity-50">
                    {busy === o.theme ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Generate recommendation
                  </button>
                  {errors[o.theme] && <span className="text-xs text-bad">{errors[o.theme]}</span>}
                </div>
              ) : (
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{rec.title}</h3>
                    <Badge tone="accent">Effort {rec.effort}</Badge>
                  </div>
                  <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
                    <div><div className="label mb-1">Problem</div><p className="text-ink/85">{rec.problem}</p></div>
                    <div><div className="label mb-1">Recommendation</div><p className="text-ink/85">{rec.recommendation}</p></div>
                    <div><div className="label mb-1">Expected impact</div><p className="text-ink/85">{rec.expected_impact}</p></div>
                    <div><div className="label mb-1">Success metric</div><p className="text-ink/85">{rec.success_metric}</p></div>
                    <div className="md:col-span-2"><div className="label mb-1">Risks</div><p className="text-ink/85">{rec.risks}</p></div>
                  </div>
                  {rec.evidence_ids.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <div className="label">Evidence</div>
                      {rec.evidence_ids.slice(0, 4).map((id) => (
                        <div key={id} className="flex gap-2 rounded-lg border border-line bg-bg/40 p-2.5 text-xs">
                          <Quote className="mt-0.5 size-3 shrink-0 text-faint" />
                          <span><span className="font-mono text-accent-2">{id}</span> {byId.get(id)?.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PM Review */}
                  <div className="mt-5 rounded-lg border border-line bg-bg/40 p-4">
                    <div className="label mb-2">PM review</div>
                    <textarea
                      value={notes[o.theme] ?? review.note ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [o.theme]: e.target.value }))}
                      placeholder="Notes for the decision (optional)"
                      className="h-16 w-full resize-none rounded-lg border border-line bg-panel p-2.5 text-sm outline-none focus:border-accent/50"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(Object.keys(STATUS) as ReviewStatus[]).map((s) => {
                        const { label, icon: Icon } = STATUS[s];
                        return (
                          <button
                            key={s}
                            onClick={() => updateReview(o.theme, { status: s, note: notes[o.theme] ?? review.note ?? "", decidedAt: new Date().toISOString() })}
                            className={clsx(
                              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                              review.status === s ? "border-accent/50 bg-accent/15 text-ink" : "border-line text-muted hover:text-ink",
                            )}
                          >
                            <Icon className="size-3.5" /> {label}
                          </button>
                        );
                      })}
                      <button onClick={() => generate(o)} disabled={!!busy} className="ml-auto text-xs text-muted hover:text-ink disabled:opacity-50">
                        {busy === o.theme ? "Regenerating..." : "Regenerate"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
