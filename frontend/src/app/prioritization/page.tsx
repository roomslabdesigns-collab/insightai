"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, Loading, NeedsData, PageHeader, priorityTone } from "@/components/ui";
import { capabilities, opportunities, type Opportunity } from "@/lib/analytics";
import { money, pct } from "@/lib/format";
import { useStore } from "@/lib/store";

type Key = "score" | "revenue_at_risk" | "evidence" | "high_severity_share" | "churn_mentions" | "trend";

export default function Prioritization() {
  const { dataset, ready } = useStore();
  const data = useMemo(() => (dataset ? opportunities(dataset.rows) : []), [dataset]);
  const [sort, setSort] = useState<Key>("score");
  if (!ready) return <Loading />;
  if (!dataset) return <NeedsData />;
  const caps = capabilities(dataset.rows);
  const cols: { key: Key; label: string; fmt: (o: Opportunity) => string | number }[] = [
    { key: "score", label: "Impact score", fmt: (o) => o.score },
    ...(caps.revenue ? [{ key: "revenue_at_risk" as Key, label: "Revenue", fmt: (o: Opportunity) => money(o.revenue_at_risk) }] : []),
    { key: "evidence", label: "Evidence", fmt: (o) => o.evidence },
    { key: "high_severity_share", label: "High sev", fmt: (o) => `${o.high_severity_share}%` },
    { key: "churn_mentions", label: "Churn", fmt: (o) => o.churn_mentions },
    ...(caps.dates ? [{ key: "trend" as Key, label: "Trend", fmt: (o: Opportunity) => pct(o.trend) }] : []),
  ];
  const rows = [...data].sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Prioritization" subtitle="Impact + revenue + severity + evidence. Click a column to sort." />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label px-4 py-3 font-normal">Opportunity</th>
              {cols.map((c) => (
                <th key={c.key} className="px-4 py-3 font-normal">
                  <button onClick={() => setSort(c.key)} className={clsx("label flex items-center gap-1", sort === c.key && "!text-accent-2")}>
                    {c.label}
                    {sort === c.key ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-50" />}
                  </button>
                </th>
              ))}
              <th className="label px-4 py-3 font-normal">Priority</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.theme} className="border-b border-line/60 last:border-0 hover:bg-panel-2/50">
                <td className="max-w-xs px-4 py-3">
                  <div className="font-medium">{o.theme}</div>
                  <div className="truncate text-xs text-muted">{o.description}</div>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className={clsx("px-4 py-3 font-mono", c.key === "score" && "text-accent-2", c.key === "trend" && ((o.trend ?? 0) > 0 ? "text-bad" : "text-good"))}>
                    {c.fmt(o)}
                  </td>
                ))}
                <td className="px-4 py-3"><Badge tone={priorityTone(o.priority)}>{o.priority}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-faint">
        {caps.revenue
          ? "Score = 35% evidence + 30% revenue at risk + 15% high-severity share + 10% churn share + 10% growth."
          : "Score = 50% evidence + 25% high-severity share + 15% churn share + 10% growth. Add a revenue column to weight by revenue."}
      </p>
    </div>
  );
}
