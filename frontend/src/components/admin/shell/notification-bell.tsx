"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CalendarOff,
  CheckCheck,
  Receipt,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveEvents } from "@/lib/live";
import {
  ago,
  listNotifications,
  markAllRead,
  markRead,
  type Notification,
} from "@/lib/notifications";
import { useBadges } from "./badges";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ElementType> = {
  leave_request: CalendarOff,
  reimbursement_claim: Receipt,
};

export function NotificationBell() {
  const router = useRouter();
  const { summary, refresh } = useBadges();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listNotifications(20)
      .then((data) => {
        if (!alive) return;
        setRows(data);
        // Clock read on open, not during render.
        setNow(Date.now());
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [open]);

  // Keep an open panel current while the admin is looking at it.
  useLiveEvents(
    "admin",
    () => {
      listNotifications(20)
        .then((data) => {
          setRows(data);
          setNow(Date.now());
        })
        .catch(() => {});
    },
    open,
  );

  const unread = summary?.unread ?? 0;

  async function openOne(row: Notification) {
    setOpen(false);
    if (!row.read_at) {
      await markRead(row.id).catch(() => {});
      refresh();
    }
    if (row.link) router.push(row.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread ? `Notifications, ${unread} unread` : "Notifications"
          }
          className="relative flex size-9 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <p className="text-sm font-bold">Notifications</p>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={async () => {
                await markAllRead().catch(() => {});
                setRows((r) =>
                  (r ?? []).map((n) => ({
                    ...n,
                    read_at: n.read_at ?? new Date().toISOString(),
                  })),
                );
                refresh();
              }}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[380px] overflow-y-auto">
          {rows === null && (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          )}

          {rows?.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-foreground/70">
              Nothing yet. Leave applications and expense claims from employees
              land here.
            </p>
          )}

          <ul className="divide-y divide-border/50">
            {rows?.map((row) => {
              const Icon = ICONS[row.kind] ?? Bell;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => openOne(row)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                      !row.read_at && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                        row.read_at
                          ? "bg-muted text-foreground/60"
                          : "bg-primary/12 text-brand-ink",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-xs",
                            row.read_at ? "font-medium" : "font-bold",
                          )}
                        >
                          {row.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-foreground/60">
                          {now ? ago(row.created_at, now) : ""}
                        </span>
                      </span>
                      {row.body && (
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-foreground/75">
                          {row.body}
                        </span>
                      )}
                      {row.link && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-ink">
                          {row.kind === "leave_request"
                            ? "View request"
                            : row.kind === "reimbursement_claim"
                              ? "View claim"
                              : "Open"}
                          <ArrowRight className="size-3" />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
