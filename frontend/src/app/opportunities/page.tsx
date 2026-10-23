"use client";

import clsx from "clsx";
import { ChevronDown, Quote } from "lucide-react";
import { useState } from "react";
import { Badge, Card, ErrorState, Loading, PageHeader, confidenceTone, priorityTone, severityTone } from "@/components/ui";
import { useApi, type Opportunity } from "@/lib/api";
import { money, pct } from "@/lib/format";

export default function Opportunities() {
  const { data, error, loading } = useApi<Opportunity[]>("/api/opportunities");
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorState message={error} />;
  if (loading || !data) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Ranked Opportunities" subtitle="Product gaps prioritized by business impact, churn risk, severity, and evidence volume." />
      <div className="space-y-3">
        {data.map((o, i) => (
          <Card key={o.theme} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-accent-2">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-semibold">{o.theme}</span>
              <Badge tone={priorityTone(o.priority)}>{o.priority}</Badge>
              <Badge tone={confidenceTone(o.confidence)}>{o.confidence} confidence</Badge>
              <button
                onClick={() => setOpen(open === o.theme ? null : o.theme)}
                className="ml-auto flex items-center gap-1 text-xs text-accent-2 hover:text-ink"
              >
                Review evidence <ChevronDown className={clsx("size-3.5 transition-transform", open === o.theme && "rotate-180")} />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">{o.description}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                ["Impact score", `${o.score}/100`],
                ["ARR at risk", money(o.arr_at_risk)],
                ["Accounts", o.accounts],
                ["Evidence", `${o.evidence} signals`],
                ["Trend (YoY)", pct(o.trend)],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <div className="label">{k}</div>
                  <div className="mt-1 font-mono text-sm font-medium">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${o.score}%` }} />
            </div>
            {open === o.theme && (
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                <div className="label">Strongest evidence</div>
                {o.top_evidence.map((e) => (
                  <div key={e.id} className="flex gap-2.5 rounded-lg border border-line bg-bg/40 p-3 text-sm">
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    <div>
                      <p className="leading-relaxed text-ink/85">{e.text}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                        <span className="font-mono text-accent-2">{e.id}</span> · {e.star}★
                        <Badge tone={severityTone(e.severity)}>{e.severity}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
