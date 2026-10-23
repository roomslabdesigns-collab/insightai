"use client";
// The demo dataset: 5,000 app reviews, labelled and indexed in Pinecone ahead of time
// (backend/pipeline/export_demo.py), so loading it costs no AI quota.
import type { Dataset } from "./store";
import type { Row, Theme } from "./types";

export const DEMO_NAMESPACE = "demo-app-reviews";

export async function loadDemoDataset(): Promise<Dataset> {
  const res = await fetch("/demo/app-reviews.json");
  if (!res.ok) throw new Error(`Demo data unavailable (${res.status})`);
  const { themes, rows } = (await res.json()) as { themes: Theme[]; rows: Row[] };
  return {
    name: "Demo: 5,000 Android app reviews",
    createdAt: new Date().toISOString(),
    namespace: DEMO_NAMESPACE,
    mapping: { text: "review", date: "date", rating: "rating", customer: "customer", segment: "segment", revenue: "revenue", source: "app" },
    themes,
    rows,
    report: { raw: rows.length, empty: 0, tooShort: 0, duplicates: 0, sampledOut: 0, kept: rows.length, fallbackLabels: 0 },
  };
}
