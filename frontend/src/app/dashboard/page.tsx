"use client";

import { BarChart3, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, ErrorState, Loading, PageHeader, Stat } from "@/components/ui";
import { useApi, type Overview } from "@/lib/api";
import { date, money, num, pct } from "@/lib/format";

const AXIS = { stroke: "#5d5d70", fontSize: 11, tickLine: false, axisLine: false } as const;
const TOOLTIP = {
  contentStyle: { background: "#15151d", border: "1px solid #1f1f2b", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#ececf1" },
  cursor: { fill: "rgba(124,108,242,0.08)" },
};

export default function Dashboard() {
  const { data, error, loading } = useApi<Overview>("/api/overview");
  if (error) return <ErrorState message={error} />;
  if (loading || !data) return <Loading />;
  const { kpis, themes, timeline, date_range } = data;
  const maxImpact = Math.max(...themes.map((t) => t.impact), 1);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard"
        subtitle={`${num(kpis.signals)} reviews from ${kpis.apps} apps · ${date(date_range[0])} to ${date(date_range[1])}`}
        right={<Badge tone="accent">All sources</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Signals ingested" value={num(kpis.signals)} hint={<span className={kpis.signals_change && kpis.signals_change > 0 ? "text-good" : ""}>{pct(kpis.signals_change)} vs prior year</span>} />
        <Stat label="Churn signals" value={num(kpis.churn_signals)} hint={`${kpis.negative_share}% of all feedback is negative`} />
        <Stat label="ARR at risk" value={money(kpis.arr_at_risk)} tone="bad" hint={`${kpis.accounts_at_risk} accounts flagged for churn`} />
        <Stat label="Active themes" value={kpis.active_themes} hint="Extracted automatically" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium">Top problem themes by business impact</div>
            <div className="label">Signals · ARR impacted</div>
          </div>
          <div className="space-y-4">
            {themes.map((t, i) => (
              <div key={t.theme}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-5 font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-medium">{t.theme}</span>
                  <Badge tone={t.high_severity > t.signals * 0.3 ? "bad" : "warn"}>{Math.round((t.high_severity / t.signals) * 100)}% high sev</Badge>
                  <span className="ml-auto font-mono text-xs text-muted">{t.signals}</span>
                  <span className="w-16 text-right font-mono text-xs font-medium">{money(t.impact)}</span>
                </div>
                <div className="ml-8 mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${(t.impact / maxImpact) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-3 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between text-sm font-medium">
              Feedback volume <BarChart3 className="size-4 text-faint" />
            </div>
            <div className="h-40">
              <ResponsiveContainer>
                <BarChart data={timeline}>
                  <CartesianGrid stroke="#1f1f2b" vertical={false} />
                  <XAxis dataKey="month" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} width={28} />
                  <Tooltip {...TOOLTIP} />
                  <Bar dataKey="total" name="Reviews" fill="#7c6cf2" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between text-sm font-medium">
              Sentiment trend <TrendingUp className="size-4 text-faint" />
            </div>
            <div className="h-40">
              <ResponsiveContainer>
                <AreaChart data={timeline}>
                  <CartesianGrid stroke="#1f1f2b" vertical={false} />
                  <XAxis dataKey="month" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} width={28} />
                  <Tooltip {...TOOLTIP} cursor={{ stroke: "#2a2a38" }} />
                  <Area dataKey="positive" stackId="1" stroke="#3fcf8e" fill="#3fcf8e" fillOpacity={0.15} name="Positive" isAnimationActive={false} />
                  <Area dataKey="neutral" stackId="1" stroke="#8b8b9e" fill="#8b8b9e" fillOpacity={0.1} name="Neutral" isAnimationActive={false} />
                  <Area dataKey="negative" stackId="1" stroke="#f0616d" fill="#f0616d" fillOpacity={0.2} name="Negative" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
