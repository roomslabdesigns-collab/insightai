"use client";

import { ChevronLeft, ChevronRight, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Loading, NeedsData, PageHeader, Select, sentimentTone, severityTone } from "@/components/ui";
import { date, money, num } from "@/lib/format";
import { useStore } from "@/lib/store";

const PAGE = 25;

export default function Feedback() {
  const { dataset, ready } = useStore();
  const [q, setQ] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [severity, setSeverity] = useState("");
  const [theme, setTheme] = useState("");
  const [segment, setSegment] = useState("");
  const [page, setPage] = useState(1);

  // Sidebar search sends ?q=...
  useEffect(() => setQ(new URLSearchParams(window.location.search).get("q") || ""), []);
  useEffect(() => setPage(1), [q, sentiment, severity, theme, segment]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return (dataset?.rows || []).filter(
      (r) =>
        (!needle || r.text.toLowerCase().includes(needle)) &&
        (!sentiment || r.sentiment === sentiment) &&
        (!severity || r.severity === severity) &&
        (!theme || r.theme === theme) &&
        (!segment || r.segment === segment),
    );
  }, [dataset, q, sentiment, severity, theme, segment]);

  if (!ready) return <Loading />;
  if (!dataset) return <NeedsData />;
  const segments = [...new Set(dataset.rows.map((r) => r.segment).filter(Boolean))] as string[];
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const items = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Feedback Library" subtitle="Search, filter, and browse every cleaned and enriched feedback item." />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 sm:max-w-xs">
          <Search className="size-3.5 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search feedback content..." className="w-full bg-transparent text-sm outline-none placeholder:text-faint" />
        </label>
        <Select value={sentiment} onChange={setSentiment} options={["positive", "neutral", "negative"]} placeholder="All sentiments" />
        <Select value={severity} onChange={setSeverity} options={["high", "medium", "low"]} placeholder="All severities" />
        <Select value={theme} onChange={setTheme} options={dataset.themes.map((t) => t.name)} placeholder="All themes" />
        {segments.length > 0 && <Select value={segment} onChange={setSegment} options={segments} placeholder="All segments" />}
        <span className="ml-auto font-mono text-xs text-muted">{num(filtered.length)} results</span>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {["ID", "Content", "Customer", "Attributes", "Theme / area"].map((h) => (
                <th key={h} className="label px-4 py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-line/60 align-top last:border-0 hover:bg-panel-2/50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                  {r.id}
                  {r.date && <div className="mt-1 text-faint">{date(r.date)}</div>}
                </td>
                <td className="max-w-md px-4 py-3">
                  <p className="line-clamp-3 leading-relaxed">{r.text}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {r.rating !== undefined && <span className="flex items-center gap-0.5 text-[11px] text-muted">{r.rating}<Star className="size-3 fill-current" /></span>}
                    {r.source && <Badge>{r.source}</Badge>}
                    {r.churn_risk ? <Badge tone="bad">Churn risk</Badge> : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="font-medium">{r.customer || "n/a"}</div>
                  <div className="text-xs text-muted">{[r.segment, r.revenue ? money(r.revenue) : ""].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    {r.sentiment && <Badge tone={sentimentTone(r.sentiment)}>{r.sentiment}</Badge>}
                    {r.severity && <Badge tone={severityTone(r.severity)}>{r.severity} severity</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.theme}</div>
                  <div className="text-xs text-muted">{r.product_area}</div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted">No feedback matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="size-4" /></button>
          <span className="font-mono">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-30" aria-label="Next page"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  );
}
