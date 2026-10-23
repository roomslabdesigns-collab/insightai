"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Badge, Card, ErrorState, Loading, PageHeader, priorityTone } from "@/components/ui";
import { useApi, type Opportunity } from "@/lib/api";
import { money, pct } from "@/lib/format";

type Key = "score" | "arr_at_risk" | "accounts" | "trend" | "evidence" | "high_severity_share";
const COLS: { key: Key; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "arr_at_risk", label: "ARR at risk" },
  { key: "accounts", label: "Accounts" },
  { key: "trend", label: "Trend" },
  { key: "evidence", label: "Signals" },
  { key: "high_severity_share", label: "High sev" },
];

export default function Prioritization() {
  const { data, error, loading } = useApi<Opportunity[]>("/api/opportunities");
  const [sort, setSort] = useState<Key>("score");
  if (error) return <ErrorState message={error} />;
  if (loading || !data) return <Loading />;
  const rows = [...data].sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Decision Matrix" subtitle="Compare opportunities across business impact metrics. Click a column to sort." />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label px-4 py-3 font-normal">Opportunity</th>
              {COLS.map((c) => (
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
                <td className="px-4 py-3 font-mono text-accent-2">{o.score}</td>
                <td className="px-4 py-3 font-mono font-medium">{money(o.arr_at_risk)}</td>
                <td className="px-4 py-3 font-mono">{o.accounts}</td>
                <td className={clsx("px-4 py-3 font-mono", (o.trend ?? 0) > 0 ? "text-bad" : "text-good")}>{pct(o.trend)}</td>
                <td className="px-4 py-3 font-mono">{o.evidence}</td>
                <td className="px-4 py-3 font-mono">{o.high_severity_share}%</td>
                <td className="px-4 py-3"><Badge tone={priorityTone(o.priority)}>{o.priority}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-faint">
        Score = 35% evidence volume + 35% ARR at risk + 15% high-severity share + 15% year-over-year growth. A rising trend in complaints is shown in red.
      </p>
    </div>
  );
}
