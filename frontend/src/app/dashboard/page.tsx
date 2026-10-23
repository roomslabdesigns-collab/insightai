"use client";

import { BarChart3, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, Loading, NeedsData, PageHeader, Stat } from "@/components/ui";
import { overview } from "@/lib/analytics";
import { money, num } from "@/lib/format";
import { useStore } from "@/lib/store";

const AXIS = { stroke: "#5d5d70", fontSize: 11, tickLine: false, axisLine: false } as const;
const TOOLTIP = {
  contentStyle: { background: "#15151d", border: "1px solid #1f1f2b", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#ececf1" },
  cursor: { fill: "rgba(124,108,242,0.08)" },
};

export default function Dashboard() {
  const { dataset, ready } = useStore();
  const data = useMemo(() => (dataset ? overview(dataset.rows) : null), [dataset]);
  if (!ready) return <Loading />;
  if (!dataset || !data) return <NeedsData />;
  const { kpis, themes, timeline, caps, sentiment_split, product_areas } = data;
  const maxImpact = Math.max(...themes.map((t) => t.impact), 1);
  const split = ["positive", "neutral", "negative"].map((s) => ({ name: s, value: sentiment_split[s as keyof typeof sentiment_split] }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Product Insights" subtitle={`${num(kpis.signals)} feedback items from ${dataset.name}`} right={<Badge tone="accent">{dataset.themes.length} themes</Badge>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Signals analysed" value={num(kpis.signals)} hint={`${kpis.negative_share}% negative`} />
        <Stat label="Churn signals" value={num(kpis.churn_signals)} hint="Customers threatening to leave" />
        {caps.revenue ? (
          <Stat label="Revenue at risk" value={money(kpis.revenue_at_risk)} tone="bad" hint={`${kpis.accounts_at_risk} accounts flagged for churn`} />
        ) : (
          <Stat label="High-severity issues" value={num(themes.reduce((s, t) => s + t.high_severity, 0))} tone="bad" hint="Broken flows, data loss, churn threats" />
        )}
        <Stat label="Active themes" value={kpis.active_themes} hint="Discovered by the LLM" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium">Top problem themes by {caps.revenue ? "revenue impact" : "severity-weighted impact"}</div>
            <div className="label">Signals · {caps.revenue ? "revenue" : "impact"}</div>
          </div>
          {themes.length === 0 && <p className="text-sm text-muted">No negative feedback found.</p>}
          <div className="space-y-4">
            {themes.map((t, i) => (
              <div key={t.theme}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-5 font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-medium">{t.theme}</span>
                  <Badge tone={t.high_severity > t.signals * 0.3 ? "bad" : "warn"}>{Math.round((t.high_severity / t.signals) * 100)}% high sev</Badge>
                  <span className="ml-auto font-mono text-xs text-muted">{t.signals}</span>
                  <span className="w-16 text-right font-mono text-xs font-medium">{caps.revenue ? money(t.impact) : t.impact}</span>
                </div>
                <div className="ml-8 mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${(t.impact / maxImpact) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-3 lg:col-span-2">
          {caps.dates && timeline.length > 1 ? (
            <>
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between text-sm font-medium">Feedback volume <BarChart3 className="size-4 text-faint" /></div>
                <div className="h-40">
                  <ResponsiveContainer>
                    <BarChart data={timeline}>
                      <CartesianGrid stroke="#1f1f2b" vertical={false} />
                      <XAxis dataKey="month" {...AXIS} interval="preserveStartEnd" />
                      <YAxis {...AXIS} width={28} />
                      <Tooltip {...TOOLTIP} />
                      <Bar dataKey="total" name="Items" fill="#7c6cf2" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between text-sm font-medium">Sentiment trend <TrendingUp className="size-4 text-faint" /></div>
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
            </>
          ) : (
            <Card className="p-5">
              <div className="mb-3 text-sm font-medium">Sentiment split</div>
              <div className="h-40">
                <ResponsiveContainer>
                  <BarChart data={split} layout="vertical">
                    <XAxis type="number" {...AXIS} />
                    <YAxis type="category" dataKey="name" {...AXIS} width={64} />
                    <Tooltip {...TOOLTIP} />
                    <Bar dataKey="value" name="Items" fill="#7c6cf2" radius={[0, 3, 3, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-faint">Add a date column when uploading to see trends over time.</p>
            </Card>
          )}
          {product_areas.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 text-sm font-medium">Product areas with most complaints</div>
              <div className="space-y-1.5 text-sm">
                {product_areas.slice(0, 6).map(([area, count]) => (
                  <div key={area} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{area}</span>
                    <span className="font-mono text-xs text-muted">{count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
