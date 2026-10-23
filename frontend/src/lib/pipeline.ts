"use client";
// Steps 3-5 of the workflow, orchestrated from the browser in small batches so each serverless call stays short:
// LLM theme discovery -> LLM enrichment -> embeddings + vector index (Pinecone).
import { GENERAL_THEME, type Row, type Theme } from "./types";

export type Stage = "themes" | "enrich" | "index" | "done";
export type Progress = { stage: Stage; done: number; total: number };

const ENRICH_BATCH = 25;
const INDEX_BATCH = 90;
const CONCURRENCY = 2;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

const sentimentFromRating = (r?: number): Row["sentiment"] =>
  r === undefined ? "neutral" : r <= (r > 5 ? 4 : 2) ? "negative" : r >= (r > 5 ? 8 : 4) ? "positive" : "neutral";

export async function discoverThemes(rows: Row[]): Promise<Theme[]> {
  const step = Math.max(1, Math.floor(rows.length / 60));
  const samples = rows.filter((_, i) => i % step === 0).slice(0, 60).map((r) => r.text);
  const { themes } = await post<{ themes: Theme[] }>("/api/themes", { samples });
  return themes;
}

/** Label every row. Rows the LLM skipped are retried once, then fall back to rating-based sentiment. */
export async function enrich(rows: Row[], themes: Theme[], onProgress: (p: Progress) => void): Promise<{ rows: Row[]; fallback: number }> {
  const names = themes.map((t) => t.name);
  const labelled = new Map<string, Partial<Row>>();
  const run = async (batch: Row[]) => {
    const { labels } = await post<{ labels: Record<string, Partial<Row>> }>("/api/enrich", {
      themes: names,
      rows: batch.map((r) => ({ id: r.id, text: r.text, rating: r.rating })),
    });
    for (const [id, l] of Object.entries(labels)) labelled.set(id, l);
  };

  for (const pass of [0, 1]) {
    const todo = rows.filter((r) => !labelled.has(r.id));
    const batches = Array.from({ length: Math.ceil(todo.length / ENRICH_BATCH) }, (_, i) => todo.slice(i * ENRICH_BATCH, (i + 1) * ENRICH_BATCH));
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const b = batches[next++];
        try {
          await run(b);
        } catch (e) {
          if (pass === 1 || /limit|quota/i.test((e as Error).message)) throw e;
        }
        onProgress({ stage: "enrich", done: labelled.size, total: rows.length });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (labelled.size === rows.length) break;
  }

  let fallback = 0;
  const out = rows.map((r) => {
    const l = labelled.get(r.id);
    if (l) return { ...r, ...l };
    fallback++;
    return { ...r, sentiment: sentimentFromRating(r.rating), theme: GENERAL_THEME, severity: "low" as const, feedback_type: "complaint", churn_risk: false, summary: r.text.slice(0, 80) };
  });
  return { rows: out, fallback };
}

export async function indexRows(rows: Row[], onProgress: (p: Progress) => void): Promise<string> {
  let namespace: string | undefined;
  for (let i = 0; i < rows.length; i += INDEX_BATCH) {
    const res = await post<{ namespace: string }>("/api/index", { namespace, rows: rows.slice(i, i + INDEX_BATCH) });
    namespace = res.namespace;
    onProgress({ stage: "index", done: Math.min(i + INDEX_BATCH, rows.length), total: rows.length });
  }
  return namespace!;
}

export { post };
