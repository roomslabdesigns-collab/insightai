"use client";

import clsx from "clsx";
import { ChevronDown, Quote } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, Loading, NeedsData, PageHeader, confidenceTone, priorityTone, severityTone } from "@/components/ui";
import { capabilities, opportunities } from "@/lib/analytics";
import { money, pct } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function Opportunities() {
  const { dataset, ready } = useStore();
  const data = useMemo(() => (dataset ? opportunities(dataset.rows) : []), [dataset]);
  const [open, setOpen] = useState<string | null>(null);
  if (!ready) return <Loading />;
  if (!dataset) return <NeedsData />;
  const caps = capabilities(dataset.rows);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Product Opportunities"
        subtitle="Problem areas ranked by impact score: evidence volume, severity, churn risk, trend and revenue."
        right={<Link href="/recommendations/" className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white">Get recommendations</Link>}
      />
      {data.length === 0 && <Card className="p-6 text-sm text-muted">No negative feedback found, so there are no problem areas to rank.</Card>}
      <div className="space-y-3">
        {data.map((o, i) => (
          <Card key={o.theme} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-accent-2">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-semibold">{o.theme}</span>
              <Badge tone={priorityTone(o.priority)}>{o.priority}</Badge>
              <Badge tone={confidenceTone(o.confidence)}>{o.confidence} confidence</Badge>
              <button onClick={() => setOpen(open === o.theme ? null : o.theme)} className="ml-auto flex items-center gap-1 text-xs text-accent-2 hover:text-ink">
                Review evidence <ChevronDown className={clsx("size-3.5 transition-transform", open === o.theme && "rotate-180")} />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">{o.description}</p>
            {o.product_areas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">{o.product_areas.map((a) => <Badge key={a}>{a}</Badge>)}</div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                ["Impact score", `${o.score}/100`],
                caps.revenue ? ["Revenue at risk", money(o.revenue_at_risk)] : ["High severity", `${o.high_severity_share}%`],
                [caps.customers ? "Accounts" : "Churn mentions", caps.customers ? o.accounts : o.churn_mentions],
                ["Evidence", `${o.evidence} signals`],
                ["Trend", pct(o.trend)],
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
                {o.top_evidence.slice(0, 4).map((e) => (
                  <div key={e.id} className="flex gap-2.5 rounded-lg border border-line bg-bg/40 p-3 text-sm">
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    <div>
                      <p className="leading-relaxed text-ink/85">{e.text}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                        <span className="font-mono text-accent-2">{e.id}</span>
                        {e.rating !== undefined && <span>· {e.rating}★</span>}
                        {e.severity && <Badge tone={severityTone(e.severity)}>{e.severity}</Badge>}
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
