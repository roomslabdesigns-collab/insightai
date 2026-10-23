import clsx from "clsx";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("rounded-xl border border-line bg-panel", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, icon, right }: { title: string; subtitle: string; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          {icon}
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

const TONES = {
  neutral: "border-line bg-panel-2 text-muted",
  accent: "border-accent/30 bg-accent/10 text-accent-2",
  good: "border-good/25 bg-good/10 text-good",
  warn: "border-warn/25 bg-warn/10 text-warn",
  bad: "border-bad/25 bg-bad/10 text-bad",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide", TONES[tone], className)}>
      {children}
    </span>
  );
}

export const sentimentTone = (s: string): Tone => (s === "negative" ? "bad" : s === "positive" ? "good" : "neutral");
export const severityTone = (s: string): Tone => (s === "high" ? "bad" : s === "medium" ? "warn" : "neutral");
export const priorityTone = (p: string): Tone => (p === "P0" ? "bad" : p === "P1" ? "warn" : p === "P2" ? "accent" : "neutral");
export const confidenceTone = (c: string): Tone => (c === "high" ? "good" : c === "medium" ? "accent" : "warn");

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "bad" | "good" }) {
  return (
    <Card className="p-4">
      <div className="label">{label}</div>
      <div className={clsx("mt-2 text-2xl font-semibold tabular-nums", tone === "bad" && "text-bad", tone === "good" && "text-good")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {label}...
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Card className="flex items-start gap-3 border-bad/30 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
      <div>
        <div className="font-medium">Something went wrong</div>
        <div className="mt-1 text-muted">{message}</div>
      </div>
    </Card>
  );
}

/** Shown on analysis pages until a dataset has been uploaded and processed. */
export function NeedsData() {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <FileUp className="mx-auto size-8 text-accent" />
      <div className="mt-3 text-lg font-semibold">Upload customer feedback to begin</div>
      <p className="mt-1 text-sm text-muted">Reviews, support tickets, surveys or interview notes as CSV, JSON or TXT.</p>
      <Link href="/upload/" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm text-white">Go to Data Sources</Link>
    </Card>
  );
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus:border-accent/60"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o.charAt(0).toUpperCase() + o.slice(1)}
        </option>
      ))}
    </select>
  );
}
