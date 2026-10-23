"use client";

import { useEffect, useState } from "react";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Sentiment = "positive" | "neutral" | "negative";
export type Severity = "low" | "medium" | "high";

export interface Review {
  id: string;
  app: string;
  text: string;
  date: string;
  star: number;
  customer_id: string;
  segment: string;
  arr: number;
  source: string;
  sentiment: Sentiment;
  theme: string;
  severity: Severity;
  feedback_type: string;
  summary: string;
  churn_risk: number;
  enriched_by: string;
}

export interface Health {
  status: string;
  reviews: Record<string, number>;
  vector_store: { backend: string; vectors: number };
  llm: { base_url: string; models: string[]; reachable: boolean };
  embedding_model: string;
  reranker: string | null;
  themes: string[];
  segments: string[];
}

export interface Overview {
  kpis: {
    signals: number;
    signals_change: number | null;
    churn_signals: number;
    negative_share: number;
    arr_at_risk: number;
    accounts_at_risk: number;
    active_themes: number;
    apps: number;
  };
  themes: { theme: string; signals: number; impact: number; high_severity: number }[];
  timeline: { month: string; positive: number; neutral: number; negative: number; total: number }[];
  sentiment_split: Record<Sentiment, number>;
  date_range: [string, string];
}

export interface Opportunity {
  theme: string;
  score: number;
  priority: "P0" | "P1" | "P2" | "P3";
  confidence: "low" | "medium" | "high";
  arr_at_risk: number;
  accounts: number;
  evidence: number;
  high_severity_share: number;
  churn_mentions: number;
  trend: number | null;
  description: string;
  top_evidence: { id: string; text: string; severity: Severity; star: number }[];
}

export interface Segment {
  segment: string;
  arr: number;
  accounts: number;
  sentiment_score: number;
  churn_risk: number;
  feedback: number;
  top_problems: { theme: string; count: number }[];
}

export interface FeedbackPage {
  total: number;
  page: number;
  page_size: number;
  items: Review[];
}

export interface QueryResult {
  question: string;
  answer: {
    insight: string;
    themes: string[];
    affected_segments: string[];
    severity: Severity;
    evidence_ids: string[];
    opportunity: string;
    confidence: "low" | "medium" | "high";
  };
  evidence: (Review & { score: number; cited: boolean })[];
  review: { needs_human_review: boolean; reasons: string[] };
  meta: {
    mode: "llm" | "extractive" | "none";
    latency_ms: number;
    retrieval: { dense_hits: number; keyword_hits: number; reranked: boolean; relevant?: number; latency_ms?: number };
    llm?: { model?: string; prompt_tokens?: number; completion_tokens?: number };
  };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    api<T>(path)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path]);

  return { data, error, loading };
}
