"use client";

import { Download, Gavel } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge, Card, Loading, NeedsData, PageHeader, Stat, type Tone } from "@/components/ui";
import { opportunities } from "@/lib/analytics";
import { useStore, type ReviewStatus } from "@/lib/store";

const LABEL: Record<ReviewStatus, [string, Tone]> = {
  approved: ["Approved", "good"],
  needs_evidence: ["Needs more evidence", "warn"],
  rejected: ["Rejected", "bad"],
};

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function Decisions() {
  const { dataset, ready, reviews } = useStore();
  const opps = useMemo(() => (dataset ? opportunities(dataset.rows) : []), [dataset]);
  if (!ready) return <Loading />;
  if (!dataset) return <NeedsData />;

  const decided = Object.values(reviews)
    .filter((r) => r.status && r.recommendation)
    .map((r) => ({ ...r, opp: opps.find((o) => o.theme === r.theme) }))
    .sort((a, b) => (b.decidedAt || "").localeCompare(a.decidedAt || ""));
  const count = (s: ReviewStatus) => decided.filter((d) => d.status === s).length;

  const exportCsv = () => {
    const header = ["theme", "priority", "score", "status", "title", "recommendation", "effort", "success_metric", "note", "evidence_ids", "decided_at"];
    const lines = decided.map((d) =>
      [d.theme, d.opp?.priority, d.opp?.score, d.status, d.recommendation!.title, d.recommendation!.recommendation, d.recommendation!.effort,
        d.recommendation!.success_metric, d.note, d.recommendation!.evidence_ids.join(" "), d.decidedAt].map(csvCell).join(","),
    );
    download("insightai-decisions.csv", [header.join(","), ...lines].join("\n"), "text/csv");
  };

  const exportMd = () => {
    const md = [
      `# Product decisions: ${dataset.name}`,
      `_Exported ${new Date().toLocaleString()} from InsightAI · ${dataset.rows.length} feedback items_`,
      "",
      ...decided.flatMap((d) => [
        `## ${d.recommendation!.title}`,
        `**Theme:** ${d.theme} · **Priority:** ${d.opp?.priority ?? "n/a"} (score ${d.opp?.score ?? "n/a"}) · **Decision:** ${LABEL[d.status!][0]} · **Effort:** ${d.recommendation!.effort}`,
        "",
        `**Problem.** ${d.recommendation!.problem}`,
        "",
        `**Recommendation.** ${d.recommendation!.recommendation}`,
        "",
        `**Expected impact.** ${d.recommendation!.expected_impact}`,
        "",
        `**Success metric.** ${d.recommendation!.success_metric}`,
        "",
        `**Risks.** ${d.recommendation!.risks}`,
        d.note ? `\n**PM note.** ${d.note}` : "",
        `\n_Evidence: ${d.recommendation!.evidence_ids.join(", ") || "none"}_`,
        "",
      ]),
    ].join("\n");
    download("insightai-decisions.md", md, "text/markdown");
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Product Decisions"
        icon={<Gavel className="size-5 text-accent" />}
        subtitle="The decision log: every recommendation a PM has reviewed, with the evidence behind it."
        right={
          decided.length > 0 && (
            <div className="flex gap-2">
              <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent/40"><Download className="size-3.5" /> CSV</button>
              <button onClick={exportMd} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent/40"><Download className="size-3.5" /> Markdown</button>
            </div>
          )
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Approved" value={count("approved")} tone="good" />
        <Stat label="Needs more evidence" value={count("needs_evidence")} />
        <Stat label="Rejected" value={count("rejected")} tone="bad" />
      </div>
      {decided.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No decisions yet. Review recommendations on the <Link href="/recommendations/" className="text-accent-2 underline">Recommendations</Link> page.
        </Card>
      ) : (
        <div className="space-y-3">
          {decided.map((d) => (
            <Card key={d.theme} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={LABEL[d.status!][1]}>{LABEL[d.status!][0]}</Badge>
                <span className="font-semibold">{d.recommendation!.title}</span>
                <span className="ml-auto font-mono text-xs text-faint">{d.decidedAt && new Date(d.decidedAt).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-xs text-muted">{d.theme} · {d.opp?.priority} · effort {d.recommendation!.effort} · metric: {d.recommendation!.success_metric}</div>
              <p className="mt-2 text-sm text-ink/85">{d.recommendation!.recommendation}</p>
              {d.note && <p className="mt-2 rounded-lg border border-line bg-bg/40 p-2.5 text-sm"><span className="label mr-2">PM note</span>{d.note}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
