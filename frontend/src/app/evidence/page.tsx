"use client";

import clsx from "clsx";
import { Quote, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, Loading, NeedsData, PageHeader, severityTone } from "@/components/ui";
import { opportunities } from "@/lib/analytics";
import { date, money } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function Evidence() {
  const { dataset, ready } = useStore();
  const opps = useMemo(() => (dataset ? opportunities(dataset.rows) : []), [dataset]);
  const [picked, setPicked] = useState("");
  if (!ready) return <Loading />;
  if (!dataset) return <NeedsData />;
  const theme = picked || opps[0]?.theme || "";
  const current = opps.find((o) => o.theme === theme);
  const quotes = dataset.rows
    .filter((r) => r.theme === theme && r.sentiment === "negative")
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity || "low"] - ({ high: 0, medium: 1, low: 2 })[b.severity || "low"])
    .slice(0, 30);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Evidence Library" subtitle="Customer quotes behind each opportunity, ready to cite in a PRD." />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {opps.map((o) => (
          <button key={o.theme} onClick={() => setPicked(o.theme)} className={clsx("shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors", o.theme === theme ? "border-accent/40 bg-accent/15 text-ink" : "border-line text-muted hover:text-ink")}>
            {o.theme} <span className="ml-1 font-mono text-faint">{o.evidence}</span>
          </button>
        ))}
      </div>
      {current && (
        <Card className="mb-4 flex flex-wrap gap-6 p-4 text-sm">
          <div><div className="label">Negative signals</div><div className="mt-1 font-mono">{current.evidence}</div></div>
          <div><div className="label">High severity</div><div className="mt-1 font-mono">{current.high_severity_share}%</div></div>
          <div><div className="label">Churn mentions</div><div className="mt-1 font-mono">{current.churn_mentions}</div></div>
          {current.revenue_at_risk > 0 && <div><div className="label">Revenue at risk</div><div className="mt-1 font-mono">{money(current.revenue_at_risk)}</div></div>}
        </Card>
      )}
      {opps.length === 0 && <Card className="p-6 text-sm text-muted">No negative feedback to show.</Card>}
      <div className="grid gap-3 md:grid-cols-2">
        {quotes.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex gap-2.5">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <p className="line-clamp-6 text-sm leading-relaxed text-ink/90" title={r.text}>{r.text}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-6 text-[11px] text-muted">
              <span className="font-mono text-accent-2">{r.id}</span>
              {r.rating !== undefined && <span className="flex items-center gap-0.5">· {r.rating}<Star className="size-3 fill-current" /></span>}
              {r.date && <span>· {date(r.date)}</span>}
              {r.customer && <span>· {r.customer}</span>}
              {r.severity && <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>}
              {r.churn_risk ? <Badge tone="bad">churn risk</Badge> : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
