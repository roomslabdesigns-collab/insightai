// Best-effort abuse protection for the public API routes: per-IP daily limits (in memory, per warm
// instance) and a consistent JSON error shape. Visitors share the owner's free AI quota.
import { NextResponse } from "next/server";
import { QuotaError } from "./llm";

const counts = new Map<string, number>();

export const LIMITS = { themes: 30, enrich: 300, index: 150, ask: 60, recommend: 60 } as const;

export function overLimit(req: Request, route: keyof typeof LIMITS): boolean {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const key = `${ip}:${route}:${new Date().toISOString().slice(0, 10)}`;
  const n = (counts.get(key) || 0) + 1;
  counts.set(key, n);
  if (counts.size > 10_000) counts.clear();
  return n > LIMITS[route];
}

export const tooMany = () => NextResponse.json({ error: "Daily limit reached for this demo. Try again tomorrow." }, { status: 429 });

export function fail(e: unknown) {
  const message = e instanceof Error ? e.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: e instanceof QuotaError ? 503 : 500 });
}

export const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
