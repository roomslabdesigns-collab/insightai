"use client";
// Steps 1-2 of the workflow, in the browser: read an uploaded file, map its columns, and clean the rows.
import Papa from "papaparse";
import type { Row } from "./types";

export const MAX_ROWS = 1000;

export type Mapping = { text: string; date?: string; rating?: string; customer?: string; segment?: string; revenue?: string; source?: string };
export type Records = { columns: string[]; records: Record<string, string>[] };
export type CleanReport = { raw: number; empty: number; tooShort: number; duplicates: number; sampledOut: number; kept: number };

export async function parseFile(file: File): Promise<Records> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) {
    const lines = (await file.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return { columns: ["text"], records: lines.map((text) => ({ text })) };
  }
  if (name.endsWith(".json")) {
    const data = JSON.parse(await file.text());
    const arr: unknown[] = Array.isArray(data) ? data : Object.values(data).find(Array.isArray) || [];
    const records = arr.map((x) => (typeof x === "string" ? { text: x } : Object.fromEntries(Object.entries(x as object).map(([k, v]) => [k, String(v ?? "")]))));
    return { columns: [...new Set(records.flatMap((r) => Object.keys(r)))], records };
  }
  // CSV / TSV
  return new Promise((resolve, reject) =>
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve({ columns: (res.meta.fields || []).filter(Boolean), records: res.data }),
      error: reject,
    }),
  );
}

const find = (columns: string[], re: RegExp) => columns.find((c) => re.test(c));

/** Guess which columns hold the text and the optional fields. The user can change it. */
export function guessMapping({ columns, records }: Records): Mapping {
  const sample = records.slice(0, 200);
  const avgLen = (c: string) => sample.reduce((s, r) => s + String(r[c] ?? "").length, 0) / (sample.length || 1);
  const text = find(columns, /^(text|review|feedback|comment|content|body|message|description)s?$/i) || [...columns].sort((a, b) => avgLen(b) - avgLen(a))[0];
  return {
    text,
    date: find(columns, /date|time|created|submitted/i),
    rating: find(columns, /rating|stars?|score|nps|csat/i),
    customer: find(columns, /customer|account|company|client|user_?id|org/i),
    segment: find(columns, /segment|plan|tier|cohort/i),
    revenue: find(columns, /arr|mrr|revenue|contract|acv|spend/i),
    source: find(columns, /source|channel|origin|platform/i),
  };
}

function decodeEntities(s: string): string {
  if (!/&[#a-z0-9]+;/i.test(s)) return s;
  const t = document.createElement("textarea");
  t.innerHTML = s; // a textarea never runs markup, it only decodes entities
  return t.value;
}

const num = (v: string | undefined) => {
  if (v == null || v === "") return undefined;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const isoDate = (v: string | undefined) => {
  if (!v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
};

export function clean({ records }: Records, m: Mapping, maxRows = MAX_ROWS): { rows: Row[]; report: CleanReport } {
  const report: CleanReport = { raw: records.length, empty: 0, tooShort: 0, duplicates: 0, sampledOut: 0, kept: 0 };
  const seen = new Set<string>();
  let rows: Row[] = [];
  for (const r of records) {
    const text = decodeEntities(String(r[m.text] ?? "")).replace(/\s+/g, " ").trim();
    if (!text) { report.empty++; continue; }
    if (text.length < 10) { report.tooShort++; continue; }
    const key = text.toLowerCase();
    if (seen.has(key)) { report.duplicates++; continue; }
    seen.add(key);
    rows.push({
      id: "",
      text: text.slice(0, 1000),
      date: m.date ? isoDate(r[m.date]) : undefined,
      rating: m.rating ? num(r[m.rating]) : undefined,
      customer: m.customer ? String(r[m.customer] ?? "").trim() || undefined : undefined,
      segment: m.segment ? String(r[m.segment] ?? "").trim() || undefined : undefined,
      revenue: m.revenue ? num(r[m.revenue]) : undefined,
      source: m.source ? String(r[m.source] ?? "").trim() || undefined : undefined,
    });
  }
  if (rows.length > maxRows) {
    // Keep an even spread across the file rather than just the first rows
    const step = rows.length / maxRows;
    report.sampledOut = rows.length - maxRows;
    rows = Array.from({ length: maxRows }, (_, i) => rows[Math.floor(i * step)]);
  }
  rows.forEach((r, i) => (r.id = `F${String(i + 1).padStart(4, "0")}`));
  report.kept = rows.length;
  return { rows, report };
}
