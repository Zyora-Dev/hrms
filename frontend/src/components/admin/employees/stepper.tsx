"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type Step = { id: string; title: string; description: string };

export function Stepper({
  steps,
  current,
  furthest,
  onJump,
}: {
  steps: Step[];
  current: number;
  /** Highest step reached — earlier steps stay clickable. */
  furthest: number;
  onJump: (index: number) => void;
}) {
  return (
    <ol className="flex gap-2 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= furthest;

        return (
          <li key={step.id} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "group w-full rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-card hover:bg-accent/50",
                !reachable && "cursor-not-allowed opacity-55 hover:bg-card",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-brand-ink text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-xs font-semibold",
                      active ? "text-brand-ink" : "text-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                  <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                    {step.description}
                  </span>
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
