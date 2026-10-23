export function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return "n/a";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function date(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function appName(pkg: string): string {
  const last = pkg.split(".").pop() || pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}
