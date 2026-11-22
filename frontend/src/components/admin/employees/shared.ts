export * from "@/lib/employees";

/** Two-letter fallback for avatars. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const TONES: Record<string, string> = {
  active: "bg-primary/15 text-primary ring-primary/25",
  probation: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  notice_period: "bg-orange-500/15 text-orange-700 ring-orange-500/25",
  on_leave: "bg-sky-500/15 text-sky-700 ring-sky-500/25",
  resigned: "bg-muted text-muted-foreground ring-border",
  terminated: "bg-destructive/15 text-destructive ring-destructive/25",
};

export function statusTone(status: string) {
  return TONES[status] ?? TONES.resigned;
}

/** "12 Mar 2024" — fixed locale so server and client render identically. */
export function formatDate(value: string | null) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

export function formatCurrency(value: string | null) {
  if (!value) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
