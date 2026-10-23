"use client";

import clsx from "clsx";
import { TrendingDown, TrendingUp, Users } from "lucide-react";
import { Card, ErrorState, Loading, PageHeader } from "@/components/ui";
import { useApi, type Segment } from "@/lib/api";
import { money, num } from "@/lib/format";

export default function Segments() {
  const { data, error, loading } = useApi<Segment[]>("/api/segments");
  if (error) return <ErrorState message={error} />;
  if (loading || !data) return <Loading />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Customer Segments"
        icon={<Users className="size-5 text-accent" />}
        subtitle="Compare feedback volume, sentiment, and top problems across customer cohorts."
      />
      <div className="space-y-3">
        {data.map((s) => (
          <Card key={s.segment} className="grid gap-5 p-5 md:grid-cols-[1.2fr_2fr_1.4fr] md:items-center">
            <div>
              <div className="text-lg font-semibold">{s.segment}</div>
              <div className="mt-0.5 font-mono text-xs text-muted">{money(s.arr)} ARR · {s.accounts} accounts</div>
            </div>
            <div className="grid grid-cols-3 gap-4 md:border-x md:border-line md:px-6">
              <div>
                <div className="label">Sentiment</div>
                <div className={clsx("mt-1 flex items-center gap-1 font-mono text-xl font-semibold", s.sentiment_score < 0 ? "text-bad" : "text-good")}>
                  {s.sentiment_score > 0 ? "+" : ""}{s.sentiment_score}
                  {s.sentiment_score < 0 ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
                </div>
              </div>
              <div>
                <div className="label">Churn risk</div>
                <div className="mt-1 font-mono text-xl font-semibold text-bad">{s.churn_risk}</div>
              </div>
              <div>
                <div className="label">Feedback</div>
                <div className="mt-1 font-mono text-xl font-semibold">{num(s.feedback)}</div>
              </div>
            </div>
            <div>
              <div className="label">Top problems</div>
              <ol className="mt-1.5 space-y-1 text-sm">
                {s.top_problems.map((p, i) => (
                  <li key={p.theme} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-accent-2">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1">{p.theme}</span>
                    <span className="font-mono text-xs text-faint">{p.count}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-faint">Sentiment score = (positive − negative) / total × 100. Segment and ARR values are synthetic; the review text is real.</p>
    </div>
  );
}
