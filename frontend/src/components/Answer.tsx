"use client";

import clsx from "clsx";
import { AlertTriangle, ChevronDown, Quote, Sparkles, Star, Target } from "lucide-react";
import { useState } from "react";
import type { QueryResult } from "@/lib/api";
import { appName, date } from "@/lib/format";
import { Badge, Card, confidenceTone, sentimentTone, severityTone } from "./ui";

export default function Answer({ result }: { result: QueryResult }) {
  const { answer, evidence, review, meta } = result;
  const [showAll, setShowAll] = useState(false);
  const cited = evidence.filter((e) => e.cited);
  const shown = showAll ? evidence : cited.length ? cited : evidence.slice(0, 4);

  // Turn "R00012" mentions in the text into small citation chips
  const withCitations = (text: string) =>
    text.split(/(R\d{5})/g).map((part, i) =>
      /^R\d{5}$/.test(part) ? (
        <a key={i} href={`#ev-${part}`} className="mx-0.5 rounded bg-accent/15 px-1 font-mono text-[11px] text-accent-2 hover:bg-accent/25">
          {part}
        </a>
      ) : (
        part
      ),
    );

  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-accent" />
          <span className="text-sm font-medium">Insight</span>
          <Badge tone={confidenceTone(answer.confidence)}>{answer.confidence} confidence</Badge>
          <Badge tone={severityTone(answer.severity)}>{answer.severity} severity</Badge>
          {meta.mode === "extractive" && <Badge tone="warn">LLM offline · extractive</Badge>}
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/90">{withCitations(answer.insight)}</p>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs">
          {answer.themes.length > 0 && (
            <div>
              <div className="label mb-1.5">Themes</div>
              <div className="flex flex-wrap gap-1.5">{answer.themes.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}</div>
            </div>
          )}
          {answer.affected_segments.length > 0 && (
            <div>
              <div className="label mb-1.5">Affected segments</div>
              <div className="flex flex-wrap gap-1.5">{answer.affected_segments.map((s) => <Badge key={s}>{s}</Badge>)}</div>
            </div>
          )}
        </div>

        {answer.opportunity && (
          <div className="mt-4 flex gap-2.5 rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm">
            <Target className="mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <span className="font-medium">Opportunity: </span>
              <span className="text-ink/85">{answer.opportunity}</span>
            </div>
          </div>
        )}

        {review.needs_human_review && (
          <div className="mt-3 flex gap-2.5 rounded-lg border border-warn/25 bg-warn/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <div className="font-medium text-warn">Needs PM review</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                {review.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>

      {evidence.length > 0 && (
        <div className="border-t border-line bg-bg/40 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="label">Evidence · {cited.length} cited of {evidence.length} retrieved</div>
            <button onClick={() => setShowAll((v) => !v)} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
              {showAll ? "Cited only" : "Show all retrieved"}
              <ChevronDown className={clsx("size-3.5 transition-transform", showAll && "rotate-180")} />
            </button>
          </div>
          <div className="space-y-2">
            {shown.map((e) => (
              <div key={e.id} id={`ev-${e.id}`} className={clsx("rounded-lg border p-3", e.cited ? "border-accent/25 bg-panel" : "border-line bg-panel/50")}>
                <div className="flex gap-2.5">
                  <Quote className="mt-0.5 size-3.5 shrink-0 text-faint" />
                  <p className="text-sm leading-relaxed text-ink/85">{e.text}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6 text-[11px] text-muted">
                  <span className="font-mono text-accent-2">{e.id}</span>
                  <span>·</span>
                  <span>{appName(e.app)}</span>
                  <span className="flex items-center gap-0.5">· {e.star}<Star className="size-3 fill-current" /></span>
                  <span>· {date(e.date)}</span>
                  <span>· {e.customer_id} ({e.segment})</span>
                  <Badge tone={sentimentTone(e.sentiment)}>{e.sentiment}</Badge>
                  <Badge>{e.theme}</Badge>
                  <span className="ml-auto font-mono text-faint">rel {e.score.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 font-mono text-[10px] text-faint">
            {meta.latency_ms} ms · hybrid retrieval ({meta.retrieval.dense_hits} dense + {meta.retrieval.keyword_hits} keyword)
            {meta.retrieval.reranked && " · cross-encoder rerank"}
            {meta.llm?.model && ` · ${meta.llm.model}`}
            {meta.llm?.prompt_tokens != null && ` · ${(meta.llm.prompt_tokens || 0) + (meta.llm.completion_tokens || 0)} tokens`}
          </div>
        </div>
      )}
    </Card>
  );
}
