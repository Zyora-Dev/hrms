"use client";

import { useSyncExternalStore } from "react";

/**
 * The time, ticking once a second.
 *
 * `useSyncExternalStore` rather than state and an effect: the clock is an
 * external source, the server snapshot is simply nothing, and reading it this
 * way keeps the current time out of render during prerendering.
 */
function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 1000);
  return () => clearInterval(timer);
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function HeaderClock() {
  const now = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );

  // Nothing is rendered until the browser has it, so the markup the server
  // produced and the markup the browser produces always agree.
  if (!now) return null;

  const at = new Date(now * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = at.getHours();
  const display = hours % 12 === 0 ? 12 : hours % 12;

  return (
    <div className="hidden items-center gap-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5 md:flex">
      <span className="flex items-baseline gap-1 font-mono text-sm font-bold tabular-nums text-foreground">
        {pad(display)}
        <span className="animate-pulse text-foreground/60">:</span>
        {pad(at.getMinutes())}
        <span className="text-xs font-semibold text-foreground/70">
          :{pad(at.getSeconds())}
        </span>
        <span className="ml-0.5 text-[10px] font-bold uppercase text-foreground/70">
          {hours < 12 ? "am" : "pm"}
        </span>
      </span>

      <span className="h-4 w-px bg-border" />

      <span className="text-[11px] font-semibold leading-tight text-foreground">
        {DAYS[at.getDay()]}
        <span className="ml-1.5 font-medium text-foreground/70">
          {at.getDate()} {MONTHS[at.getMonth()]} {at.getFullYear()}
        </span>
      </span>
    </div>
  );
}
