"use client";

import clsx from "clsx";
import { ArrowRight, Check, Database, FileUp, Loader2, RotateCcw, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { clean, guessMapping, MAX_ROWS, parseFile, type CleanReport, type Mapping, type Records } from "@/lib/clean";
import { discoverThemes, enrich, indexRows, type Progress } from "@/lib/pipeline";
import { useStore } from "@/lib/store";
import type { Row } from "@/lib/types";
import { num } from "@/lib/format";
import { loadDemoDataset } from "@/lib/demo";

const STEPS = ["Upload", "Clean", "Themes", "LLM enrichment", "Embeddings + index", "Ready"];
const OPTIONAL: { key: keyof Mapping; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "rating", label: "Rating / score" },
  { key: "customer", label: "Customer / account" },
  { key: "segment", label: "Segment / plan" },
  { key: "revenue", label: "Revenue (ARR/MRR)" },
  { key: "source", label: "Source / channel" },
];

export default function UploadPage() {
  const { dataset, setDataset } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<Records | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [cleaned, setCleaned] = useState<{ rows: Row[]; report: CleanReport } | null>(null);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  async function onFile(file: File) {
    setError(null);
    setCleaned(null);
    try {
      const r = await parseFile(file);
      if (!r.records.length) throw new Error("No rows found in this file.");
      setFileName(file.name);
      setRecords(r);
      setMapping(guessMapping(r));
      setStep(1);
    } catch (e) {
      setError(`Couldn't read the file: ${(e as Error).message}`);
    }
  }

  function runClean() {
    if (!records || !mapping) return;
    const out = clean(records, mapping);
    if (!out.rows.length) return setError("No usable feedback left after cleaning. Check the text column.");
    setError(null);
    setCleaned(out);
    setStep(2);
  }

  async function runPipeline() {
    if (!cleaned || !mapping) return;
    setRunning(true);
    setError(null);
    try {
      setStep(2);
      setProgress({ stage: "themes", done: 0, total: 1 });
      const themes = await discoverThemes(cleaned.rows);
      setStep(3);
      const { rows, fallback } = await enrich(cleaned.rows, themes, setProgress);
      setStep(4);
      const namespace = await indexRows(rows, setProgress);
      setDataset({
        name: fileName,
        createdAt: new Date().toISOString(),
        namespace,
        mapping,
        themes,
        rows,
        report: { ...cleaned.report, fallbackLabels: fallback },
      });
      setStep(5);
      setReplacing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  // The demo is pre-processed (labelled + indexed once in Pinecone), so loading it costs no AI quota
  async function loadDemo() {
    setLoadingDemo(true);
    setError(null);
    try {
      setDataset(await loadDemoDataset());
      setReplacing(false);
      setStep(5);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingDemo(false);
    }
  }

  const reset = () => {
    setRecords(null);
    setMapping(null);
    setCleaned(null);
    setStep(0);
    setProgress(null);
    setError(null);
  };

  const showCurrent = dataset && !replacing && step !== 5;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Data Sources" subtitle="Upload customer feedback (reviews, tickets, surveys, interviews). InsightAI cleans, enriches and indexes it." />

      {/* Workflow stepper */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className={clsx(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                i < step || (i === 5 && step === 5) ? "border-good/30 bg-good/10 text-good" : i === step && !showCurrent ? "border-accent/40 bg-accent/15 text-ink" : "border-line text-faint",
              )}
            >
              {(i < step || (i === 5 && step === 5)) && <Check className="size-3" />}
              {i === step && running && <Loader2 className="size-3 animate-spin" />}
              {s}
            </span>
            {i < STEPS.length - 1 && <ArrowRight className="size-3 text-faint" />}
          </div>
        ))}
      </div>

      {showCurrent && (
        <Card className="mb-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="size-4 text-accent" />
            <div className="flex-1">
              <div className="font-medium">Current dataset: {dataset.name}</div>
              <div className="mt-0.5 text-xs text-muted">
                {num(dataset.rows.length)} items · {dataset.themes.length} themes · uploaded {new Date(dataset.createdAt).toLocaleString()}
              </div>
            </div>
            <Link href="/" className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white">Ask questions</Link>
            <button onClick={() => { setReplacing(true); reset(); }} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-ink">
              Upload new file
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dataset.themes.map((t) => <Badge key={t.name} tone="accent">{t.name}</Badge>)}
          </div>
        </Card>
      )}

      {!showCurrent && step === 0 && (
        <Card
          className="flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-12 text-center hover:border-accent/50"
        >
          <div
            className="flex w-full flex-col items-center gap-3"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) onFile(f);
            }}
          >
            <FileUp className="size-8 text-accent" />
            <div className="font-medium">Drop a file here or click to upload</div>
            <div className="text-xs text-muted">CSV, TSV, JSON or TXT (one item per line) · up to {num(MAX_ROWS)} items are analysed</div>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.tsv,.json,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </Card>
      )}

      {!showCurrent && step === 0 && (
        <Card className="mt-3 flex flex-wrap items-center gap-3 p-4">
          <Database className="size-4 text-accent" />
          <div className="flex-1 text-sm">
            <div className="font-medium">No data handy? Try the demo dataset</div>
            <div className="text-xs text-muted">5,000 real Android app reviews, already cleaned, AI-labelled and indexed. Customer, segment and revenue values are synthetic.</div>
          </div>
          <button onClick={loadDemo} disabled={loadingDemo} className="flex items-center gap-2 rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent-2 hover:bg-accent/10 disabled:opacity-50">
            {loadingDemo && <Loader2 className="size-4 animate-spin" />} Load demo dataset
          </button>
        </Card>
      )}

      {!showCurrent && records && mapping && step >= 1 && step < 5 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <Upload className="size-4 text-muted" />
            <span className="font-medium">{fileName}</span>
            <span className="text-muted">· {num(records.records.length)} rows · {records.columns.length} columns</span>
            {!running && <button onClick={reset} className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-ink"><RotateCcw className="size-3" /> Start over</button>}
          </div>

          <div className="label mb-2">Map your columns</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs">
              <span className="text-muted">Feedback text *</span>
              <select disabled={step > 1} value={mapping.text} onChange={(e) => setMapping({ ...mapping, text: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-line bg-panel px-2 text-sm">
                {records.columns.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            {OPTIONAL.map(({ key, label }) => (
              <label key={key} className="text-xs">
                <span className="text-muted">{label}</span>
                <select disabled={step > 1} value={mapping[key] || ""} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value || undefined })} className="mt-1 h-9 w-full rounded-lg border border-line bg-panel px-2 text-sm">
                  <option value="">None</option>
                  {records.columns.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="label mb-2 mt-5">Preview</div>
          <div className="space-y-1.5">
            {records.records.slice(0, 4).map((r, i) => (
              <div key={i} className="truncate rounded-lg border border-line bg-bg/40 px-3 py-2 text-xs text-ink/80">{String(r[mapping.text] ?? "")}</div>
            ))}
          </div>

          {step === 1 && (
            <button onClick={runClean} className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm text-white">Clean data</button>
          )}

          {cleaned && (
            <div className="mt-5 rounded-lg border border-line bg-bg/40 p-4">
              <div className="label mb-2">Cleaning report</div>
              <div className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
                {[
                  ["Rows read", cleaned.report.raw],
                  ["Empty", cleaned.report.empty],
                  ["Too short", cleaned.report.tooShort],
                  ["Duplicates", cleaned.report.duplicates],
                  ["Over limit", cleaned.report.sampledOut],
                  ["Kept", cleaned.report.kept],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <div className="text-xs text-muted">{k}</div>
                    <div className={clsx("font-mono", k === "Kept" && "text-good")}>{num(v as number)}</div>
                  </div>
                ))}
              </div>
              {step === 2 && !running && !progress && (
                <button onClick={runPipeline} className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm text-white">
                  <Sparkles className="size-4" /> Run AI pipeline
                </button>
              )}
            </div>
          )}

          {progress && step < 5 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted">
                <span>
                  {progress.stage === "themes" && "Discovering themes in your feedback..."}
                  {progress.stage === "enrich" && "Labelling sentiment, theme, severity and product area..."}
                  {progress.stage === "index" && "Creating embeddings and indexing in Pinecone..."}
                </span>
                {progress.stage !== "themes" && <span className="font-mono">{num(progress.done)} / {num(progress.total)}</span>}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div
                  className={clsx("h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all", progress.stage === "themes" && "w-1/12 animate-pulse")}
                  style={progress.stage !== "themes" ? { width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` } : undefined}
                />
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 5 && dataset && (
        <Card className="border-good/30 p-6 text-center">
          <Check className="mx-auto size-8 text-good" />
          <div className="mt-2 text-lg font-semibold">Your feedback is ready</div>
          <p className="mt-1 text-sm text-muted">
            {num(dataset.rows.length)} items enriched into {dataset.themes.length} themes and indexed for search
            {dataset.report.fallbackLabels > 0 && ` (${dataset.report.fallbackLabels} could not be labelled by the AI)`}.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm text-white">Ask questions</Link>
            <Link href="/dashboard/" className="rounded-lg border border-line px-4 py-2 text-sm">View insights</Link>
          </div>
        </Card>
      )}

      {error && (
        <Card className="mt-4 border-bad/30 p-4 text-sm">
          <div className="font-medium text-bad">Something went wrong</div>
          <div className="mt-1 text-muted">{error}</div>
          {cleaned && !running && (
            <button onClick={() => { setProgress(null); runPipeline(); }} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs">Retry</button>
          )}
        </Card>
      )}
    </div>
  );
}
