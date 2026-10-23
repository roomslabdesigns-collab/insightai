"use client";

import { ChevronLeft, ChevronRight, Search, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Card, ErrorState, Loading, PageHeader, Select, sentimentTone, severityTone } from "@/components/ui";
import { useApi, type FeedbackPage, type Health } from "@/lib/api";
import { appName, date, money, num } from "@/lib/format";

export default function Feedback() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [severity, setSeverity] = useState("");
  const [theme, setTheme] = useState("");
  const [segment, setSegment] = useState("");
  const [page, setPage] = useState(1);
  const { data: health } = useApi<Health>("/api/health");

  // Sidebar search sends ?q=...
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    setQ(initial);
    setQuery(initial);
  }, []);

  const params = new URLSearchParams({ q: query, sentiment, severity, theme, segment, page: String(page), page_size: "25" });
  const { data, error, loading } = useApi<FeedbackPage>(`/api/feedback?${params}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Feedback Library" subtitle="Search, filter, and browse all ingested customer feedback signals." />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q);
            setPage(1);
          }}
          className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 sm:max-w-xs"
        >
          <Search className="size-3.5 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search feedback content..." className="w-full bg-transparent text-sm outline-none placeholder:text-faint" />
        </form>
        <Select value={sentiment} onChange={reset(setSentiment)} options={["positive", "neutral", "negative"]} placeholder="All sentiments" />
        <Select value={severity} onChange={reset(setSeverity)} options={["high", "medium", "low"]} placeholder="All severities" />
        <Select value={theme} onChange={reset(setTheme)} options={health?.themes || []} placeholder="All themes" />
        <Select value={segment} onChange={reset(setSegment)} options={health?.segments || []} placeholder="All segments" />
        {data && <span className="ml-auto font-mono text-xs text-muted">{num(data.total)} results</span>}
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {["Date", "Content", "Customer", "Attributes", "Impact"].map((h) => (
                  <th key={h} className="label px-4 py-3 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={5} className="px-4"><Loading /></td></tr>
              ) : (
                data?.items.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 align-top last:border-0 hover:bg-panel-2/50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">{date(r.date)}</td>
                    <td className="max-w-md px-4 py-3">
                      <p className="line-clamp-3 leading-relaxed">{r.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge>{appName(r.app)}</Badge>
                        <span className="flex items-center gap-0.5 text-[11px] text-muted">{r.star}<Star className="size-3 fill-current" /></span>
                        {r.churn_risk ? <Badge tone="bad">Churn risk</Badge> : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-medium">{r.customer_id}</div>
                      <div className="text-xs text-muted">{r.segment}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={sentimentTone(r.sentiment)}>{r.sentiment}</Badge>
                        <Badge tone={severityTone(r.severity)}>{r.severity} severity</Badge>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-medium">{money(r.arr)}</div>
                      <div className="text-xs text-muted">{r.theme}</div>
                    </td>
                  </tr>
                ))
              )}
              {data && data.items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted">No feedback matches these filters.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {data && pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-30" aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-mono">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-30" aria-label="Next page">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
