"use client";

import clsx from "clsx";
import { ClipboardCheck, Database, Gavel, Library, LayoutGrid, Lightbulb, ListOrdered, MessageSquare, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { num } from "@/lib/format";
import { useStore } from "@/lib/store";

type Item = { href: string; label: string; icon: typeof Plus; count?: boolean };

const MAIN: Item[] = [
  { href: "/", label: "New Query", icon: Plus },
  { href: "/dashboard/", label: "Insights", icon: LayoutGrid },
  { href: "/feedback/", label: "Feedback", icon: MessageSquare, count: true },
  { href: "/opportunities/", label: "Opportunities", icon: Lightbulb },
  { href: "/prioritization/", label: "Prioritization", icon: ListOrdered },
  { href: "/recommendations/", label: "Recommendations", icon: ClipboardCheck },
  { href: "/decisions/", label: "Decisions", icon: Gavel },
];
const DATA: Item[] = [
  { href: "/upload/", label: "Data Sources", icon: Database },
  { href: "/evidence/", label: "Evidence Library", icon: Library },
  { href: "/segments/", label: "Customer Segments", icon: Users },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-5 items-end gap-[3px]">
        {[10, 16, 20].map((h, i) => (
          <span key={i} className="w-[4px] rounded-sm bg-accent" style={{ height: h, opacity: 0.55 + i * 0.2 }} />
        ))}
      </div>
      <div>
        <div className="text-[15px] font-semibold leading-none">InsightAI</div>
        <div className="mt-1 text-[10px] text-muted">Product Feedback Intelligence</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const { dataset, ready } = useStore();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href.replace(/\/$/, "")));

  const link = (n: Item) => {
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        className={clsx(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
          isActive(n.href) ? "bg-accent/15 text-ink ring-1 ring-accent/30" : "text-muted hover:bg-panel-2 hover:text-ink",
        )}
      >
        <Icon className="size-4" />
        <span className="flex-1">{n.label}</span>
        {n.count && dataset && <span className="rounded bg-panel-2 px-1.5 font-mono text-[10px] text-muted">{num(dataset.rows.length)}</span>}
      </Link>
    );
  };

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel/60 px-3 py-5 md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/feedback/?q=${encodeURIComponent(q)}`);
          }}
        >
          <label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-sm">
            <Search className="size-3.5 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search feedback..." className="w-full bg-transparent outline-none placeholder:text-faint" />
          </label>
        </form>
        <nav className="mt-4 space-y-0.5">{MAIN.map(link)}</nav>
        <div className="label mt-6 px-2.5">Data &amp; Intelligence</div>
        <nav className="mt-2 space-y-0.5">{DATA.map(link)}</nav>
        <div className="mt-auto rounded-lg border border-line bg-panel p-3 text-[11px]">
          <div className="flex items-center gap-1.5 font-medium">
            <span className={clsx("size-1.5 rounded-full", dataset ? "bg-good" : "bg-faint")} />
            {!ready ? "Loading..." : dataset ? "Dataset ready" : "No data yet"}
          </div>
          <div className="mt-1.5 truncate font-mono text-[10px] text-faint">
            {dataset ? `${dataset.name} · ${num(dataset.rows.length)} items` : "Upload feedback in Data Sources"}
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-20 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <nav className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-1">
          {[...MAIN, ...DATA].map((n) => (
            <Link key={n.href} href={n.href} className={clsx("shrink-0 rounded-md px-2.5 py-1.5 text-xs", isActive(n.href) ? "bg-accent/15 text-ink" : "text-muted")}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
