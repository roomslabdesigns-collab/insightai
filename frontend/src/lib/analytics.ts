// Insights, opportunities, prioritisation and segments, computed in the browser from the enriched rows.
// Revenue, customer, segment and date columns are optional; scores re-weight when they are missing.
import { GENERAL_THEME, SENTIMENTS, type Row, type Sentiment } from "./types";

const SEV_WEIGHT = { high: 3, medium: 2, low: 1 } as const;
const isIssue = (r: Row) => r.sentiment === "negative" && r.theme !== GENERAL_THEME;

/** Revenue of the distinct accounts in rows (each account counted once). */
function revenueOf(rows: Row[]): number {
  const byAccount = new Map<string, number>();
  for (const r of rows) if (r.revenue) byAccount.set(r.customer || r.id, r.revenue);
  return [...byAccount.values()].reduce((s, v) => s + v, 0);
}
const accountsOf = (rows: Row[]) => new Set(rows.map((r) => r.customer || r.id)).size;
const countBy = <K extends string>(rows: Row[], key: (r: Row) => K | undefined) => {
  const m = new Map<K, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function capabilities(rows: Row[]) {
  return {
    revenue: rows.some((r) => r.revenue),
    dates: rows.some((r) => r.date),
    segments: rows.some((r) => r.segment),
    customers: rows.some((r) => r.customer),
    ratings: rows.some((r) => r.rating !== undefined),
  };
}

/** Split the date range into a recent window and the equally long window before it. */
function windows(rows: Row[]) {
  const ts = rows.map((r) => (r.date ? Date.parse(r.date) : NaN)).filter((t) => !Number.isNaN(t));
  if (ts.length < 10) return null;
  const end = Math.max(...ts);
  const start = Math.min(...ts);
  const span = Math.max((end - start) / 4, 7 * 86_400_000);
  return { recent: (r: Row) => !!r.date && Date.parse(r.date) > end - span, prior: (r: Row) => !!r.date && Date.parse(r.date) <= end - span && Date.parse(r.date) > end - 2 * span };
}
const pct = (recent: number, prior: number) => (prior ? Math.round(((recent - prior) / prior) * 1000) / 10 : null);

export function overview(rows: Row[]) {
  const caps = capabilities(rows);
  const issues = rows.filter(isIssue);
  const churn = rows.filter((r) => r.churn_risk);
  const byTheme = new Map<string, Row[]>();
  for (const r of issues) byTheme.set(r.theme!, [...(byTheme.get(r.theme!) || []), r]);
  const themes = [...byTheme.entries()]
    .map(([theme, rs]) => ({
      theme,
      signals: rs.length,
      high_severity: rs.filter((r) => r.severity === "high").length,
      impact: caps.revenue ? revenueOf(rs) : rs.reduce((s, r) => s + SEV_WEIGHT[r.severity || "low"], 0),
    }))
    .sort((a, b) => b.impact - a.impact);

  let timeline: { month: string; positive: number; neutral: number; negative: number; total: number }[] = [];
  if (caps.dates) {
    const months = new Map<string, Record<Sentiment, number>>();
    for (const r of rows) {
      if (!r.date) continue;
      const k = r.date.slice(0, 7);
      const m = months.get(k) || { positive: 0, neutral: 0, negative: 0 };
      m[r.sentiment || "neutral"]++;
      months.set(k, m);
    }
    timeline = [...months.entries()].sort().slice(-12).map(([k, m]) => ({
      month: new Date(k + "-01T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      ...m,
      total: m.positive + m.neutral + m.negative,
    }));
  }

  return {
    caps,
    kpis: {
      signals: rows.length,
      negative_share: rows.length ? Math.round((rows.filter((r) => r.sentiment === "negative").length / rows.length) * 1000) / 10 : 0,
      churn_signals: churn.length,
      revenue_at_risk: revenueOf(churn),
      accounts_at_risk: accountsOf(churn),
      active_themes: themes.filter((t) => t.signals >= Math.max(2, rows.length * 0.01)).length,
    },
    themes,
    timeline,
    sentiment_split: Object.fromEntries(SENTIMENTS.map((s) => [s, rows.filter((r) => r.sentiment === s).length])) as Record<Sentiment, number>,
    product_areas: countBy(issues, (r) => r.product_area).slice(0, 8),
  };
}

export interface Opportunity {
  theme: string;
  score: number;
  priority: "P0" | "P1" | "P2" | "P3";
  confidence: "low" | "medium" | "high";
  evidence: number;
  accounts: number;
  revenue_at_risk: number;
  high_severity_share: number;
  churn_mentions: number;
  trend: number | null;
  product_areas: string[];
  description: string;
  top_evidence: Row[];
}

/** Prioritisation: impact score from evidence volume, revenue at risk, severity, churn and trend. */
export function opportunities(rows: Row[]): Opportunity[] {
  const caps = capabilities(rows);
  const w = windows(rows);
  const byTheme = new Map<string, Row[]>();
  for (const r of rows.filter(isIssue)) byTheme.set(r.theme!, [...(byTheme.get(r.theme!) || []), r]);
  const groups = [...byTheme.entries()];
  if (!groups.length) return [];
  const maxEv = Math.max(...groups.map(([, rs]) => rs.length));
  const maxRev = Math.max(...groups.map(([, rs]) => revenueOf(rs)), 1);

  return groups
    .map(([theme, rs]) => {
      const evidence = rs.length;
      const revenue = revenueOf(rs);
      const high = rs.filter((r) => r.severity === "high").length / evidence;
      const churn = rs.filter((r) => r.churn_risk).length;
      const trend = w ? pct(rs.filter(w.recent).length, rs.filter(w.prior).length) : null;
      const growth = Math.min(Math.max(trend || 0, 0), 100) / 100;
      const churnShare = churn / evidence;
      const score = 100 * (caps.revenue
        ? 0.35 * (evidence / maxEv) + 0.3 * (revenue / maxRev) + 0.15 * high + 0.1 * churnShare + 0.1 * growth
        : 0.5 * (evidence / maxEv) + 0.25 * high + 0.15 * churnShare + 0.1 * growth);
      const accounts = accountsOf(rs);
      const top = [...rs].sort((a, b) => SEV_WEIGHT[b.severity || "low"] - SEV_WEIGHT[a.severity || "low"] || (b.date || "").localeCompare(a.date || "")).slice(0, 8);
      return {
        theme,
        score: Math.round(score * 10) / 10,
        priority: (score >= 75 ? "P0" : score >= 55 ? "P1" : score >= 35 ? "P2" : "P3") as Opportunity["priority"],
        confidence: (evidence >= 25 ? "high" : evidence >= 10 ? "medium" : "low") as Opportunity["confidence"],
        evidence,
        accounts,
        revenue_at_risk: revenue,
        high_severity_share: Math.round(high * 1000) / 10,
        churn_mentions: churn,
        trend,
        product_areas: countBy(rs, (r) => r.product_area).slice(0, 4).map(([a]) => a),
        description: `${caps.customers ? `${accounts} account${accounts === 1 ? "" : "s"}` : `${evidence} item${evidence === 1 ? "" : "s"}`} report ${theme.toLowerCase()} problems; ${churn} mention${churn === 1 ? "s" : ""} leaving.`,
        top_evidence: top,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function segments(rows: Row[]) {
  const names = [...new Set(rows.map((r) => r.segment).filter(Boolean))] as string[];
  return names
    .map((segment) => {
      const rs = rows.filter((r) => r.segment === segment);
      const pos = rs.filter((r) => r.sentiment === "positive").length;
      const neg = rs.filter((r) => r.sentiment === "negative").length;
      return {
        segment,
        revenue: revenueOf(rs),
        accounts: accountsOf(rs),
        sentiment_score: Math.round(((pos - neg) / rs.length) * 1000) / 10,
        churn_risk: rs.filter((r) => r.churn_risk).length,
        feedback: rs.length,
        top_problems: countBy(rs.filter(isIssue), (r) => r.theme).slice(0, 3).map(([theme, count]) => ({ theme, count })),
      };
    })
    .sort((a, b) => b.feedback - a.feedback);
}
