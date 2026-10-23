"use client";

import { ArrowUp, FileText, Lightbulb, Loader2, TrendingDown, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Answer from "@/components/Answer";
import { Card, ErrorState, Loading, NeedsData } from "@/components/ui";
import { num } from "@/lib/format";
import { post } from "@/lib/pipeline";
import { useStore } from "@/lib/store";
import type { AskResult } from "@/lib/types";

const STARTERS = [
  { icon: FileText, title: "Summarize Feedback", body: "Identify the most important themes across customer feedback.", q: "What are the most common problems customers report?" },
  { icon: Lightbulb, title: "Find Opportunities", body: "Discover the highest-impact product improvements.", q: "Which features or improvements do customers request the most?" },
  { icon: Users, title: "Customer Insights", body: "Understand what different customers are saying.", q: "What frustrates customers the most?" },
  { icon: TrendingDown, title: "Analyze Churn", body: "Identify why customers leave or switch.", q: "Why are customers leaving or switching to alternatives?" },
];

type Turn = { question: string; result?: AskResult; error?: string };

export default function Home() {
  const { dataset, ready } = useStore();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // ?q=... asks a question as soon as the dataset is ready (shareable "ask this" links)
  const autoAsked = useRef(false);
  useEffect(() => {
    if (!ready || !dataset || autoAsked.current) return;
    autoAsked.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) ask(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dataset]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy || !dataset) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { question: q }]);
    try {
      const result = await post<AskResult>("/api/ask", { namespace: dataset.namespace, question: q });
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, result } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;
  if (!dataset) return <NeedsData />;

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        ask(input);
      }}
      className="flex items-center gap-2 rounded-xl border border-line bg-panel p-1.5 pl-4 focus-within:border-accent/50"
    >
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about your customer feedback..." className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
      <button disabled={busy || !input.trim()} className="grid size-9 place-items-center rounded-lg bg-accent text-white transition-opacity disabled:opacity-30" aria-label="Ask">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </button>
    </form>
  );

  if (turns.length === 0) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center">
        <div className="mx-auto mb-5 max-w-full truncate rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] text-muted">
          <span className="mr-1.5 inline-block size-1.5 rounded-full bg-accent" />
          {dataset.name} · {num(dataset.rows.length)} signals indexed · RAG
        </div>
        <h1 className="text-center text-4xl font-semibold tracking-tight md:text-5xl">How can I help you today?</h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted">
          Ask questions about your customer feedback, churn, and product opportunities. Every answer is traced back to evidence.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {STARTERS.map(({ icon: Icon, title, body, q }) => (
            <button key={title} onClick={() => ask(q)} className="rounded-xl border border-line bg-panel p-4 text-left transition-colors hover:border-accent/40 hover:bg-panel-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4 text-muted" /> {title}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{body}</p>
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="label">Themes</span>
          {dataset.themes.slice(0, 5).map((t) => (
            <button key={t.name} onClick={() => ask(`What are customers saying about ${t.name.toLowerCase()}?`)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent/40 hover:text-ink">
              {t.name}
            </button>
          ))}
        </div>
        <div className="mt-10">{composer}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="space-y-8">
        {turns.map((t, i) => (
          <div key={i} className="space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-accent/15 px-4 py-2.5 text-sm ring-1 ring-accent/25">{t.question}</div>
            {t.result && <Answer result={t.result} />}
            {t.error && <ErrorState message={t.error} />}
            {!t.result && !t.error && (
              <Card className="flex items-center gap-2 p-5 text-sm text-muted">
                <Loader2 className="size-4 animate-spin text-accent" /> Searching your feedback and generating an answer...
              </Card>
            )}
          </div>
        ))}
      </div>
      <div ref={endRef} />
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-5 pt-8 md:left-60 md:px-10">
        <div className="mx-auto max-w-3xl">{composer}</div>
      </div>
    </div>
  );
}
