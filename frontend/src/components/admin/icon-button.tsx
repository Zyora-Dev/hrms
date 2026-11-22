"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Variant = "brand" | "neutral" | "destructive";
type Size = "sm" | "default";

// `sm` is for dense tables, where a row of 36px buttons dominates the row.
const SIZES: Record<Size, { box: string; icon: string }> = {
  sm: { box: "size-7 rounded-md", icon: "size-3.5" },
  default: { box: "size-9 rounded-lg", icon: "size-[18px]" },
};

// All variants share the same box so a row of actions lines up exactly.
const VARIANTS: Record<Variant, string> = {
  brand:
    "border-primary/25 bg-primary/10 text-brand-ink hover:border-primary/40 hover:bg-primary/15",
  neutral:
    "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
  destructive:
    "border-border bg-card text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
};

/** Square icon-only action with an accessible label and tooltip. */
export function IconButton({
  label,
  icon: Icon,
  variant = "brand",
  size = "default",
  className,
  ...props
}: {
  label: string;
  icon: React.ElementType;
  variant?: Variant;
  size?: Size;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex shrink-0 items-center justify-center border transition-colors",
            "focus-visible:ring-[3px] focus-visible:ring-primary/25 focus-visible:outline-none",
            "disabled:pointer-events-none disabled:opacity-50",
            SIZES[size].box,
            VARIANTS[variant],
            className,
          )}
          {...props}
        >
          <Icon className={SIZES[size].icon} strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
