"use client";

import clsx from "clsx";
import { Quote, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Card, ErrorState, Loading, PageHeader, severityTone } from "@/components/ui";
import { useApi, type FeedbackPage, type Opportunity } from "@/lib/api";
import { appName, date, money, num } from "@/lib/format";

export default function Evidence() {
  const { data: opps, error } = useApi<Opportunity[]>("/api/opportunities");
  const [theme, setTheme] = useState("");
  useEffect(() => {
    if (opps?.length && !theme) setTheme(opps[0].theme);
  }, [opps, theme]);

  const { data, loading } = useApi<FeedbackPage>(
    theme ? `/api/feedback?theme=${encodeURIComponent(theme)}&sentiment=negative&severity=high&page_size=30` : null,
  );
  const current = opps?.find((o) => o.theme === theme);

  if (error) return <ErrorState message={error} />;
  if (!opps) return <Loading />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Evidence Library" subtitle="High-severity customer quotes behind each opportunity, ready to cite in a PRD." />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {opps.map((o) => (
          <button
            key={o.theme}
            onClick={() => setTheme(o.theme)}
            className={clsx(
              "shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors",
              o.theme === theme ? "border-accent/40 bg-accent/15 text-ink" : "border-line text-muted hover:text-ink",
            )}
          >
            {o.theme} <span className="ml-1 font-mono text-faint">{o.evidence}</span>
          </button>
        ))}
      </div>

      {current && (
        <Card className="mb-4 flex flex-wrap gap-6 p-4 text-sm">
          <div><div className="label">Negative signals</div><div className="mt-1 font-mono">{num(current.evidence)}</div></div>
          <div><div className="label">High severity</div><div className="mt-1 font-mono">{current.high_severity_share}%</div></div>
          <div><div className="label">Churn mentions</div><div className="mt-1 font-mono">{current.churn_mentions}</div></div>
          <div><div className="label">ARR at risk</div><div className="mt-1 font-mono">{money(current.arr_at_risk)}</div></div>
        </Card>
      )}

      {loading && !data ? (
        <Loading />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data?.items.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex gap-2.5">
                <Quote className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <p className="line-clamp-6 text-sm leading-relaxed text-ink/90" title={r.text}>{r.text}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-6 text-[11px] text-muted">
                <span className="font-mono text-accent-2">{r.id}</span>
                <span>· {appName(r.app)}</span>
                <span className="flex items-center gap-0.5">· {r.star}<Star className="size-3 fill-current" /></span>
                <span>· {date(r.date)}</span>
                <span>· {r.customer_id} ({r.segment})</span>
                <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>
                {r.churn_risk ? <Badge tone="bad">churn risk</Badge> : null}
              </div>
            </Card>
          ))}
          {data && data.items.length === 0 && <p className="text-sm text-muted">No high-severity evidence for this theme.</p>}
        </div>
      )}
    </div>
  );
}
