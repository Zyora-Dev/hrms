import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="relative inline-flex size-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-inset ring-primary/30">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-4 text-primary"
          aria-hidden
        >
          <path
            d="M4 19V7.5a1 1 0 0 1 .6-.92l6.8-2.9a1 1 0 0 1 1.4.92V19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12.8 19V10l5.6 2.2a1 1 0 0 1 .6.93V19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 19h18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="text-[0.95rem] font-semibold tracking-tight">
        HR<span className="text-primary">MS</span>
      </span>
    </span>
  );
}
