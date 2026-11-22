"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useLiveEvents } from "@/lib/live";
import {
  notificationSummary,
  type NotificationSummary,
} from "@/lib/notifications";

/**
 * One poll for the whole shell: the bell and the menu badges read the same
 * summary rather than each asking the server on their own.
 */
const REFRESH_MS = 60_000;

type Ctx = {
  summary: NotificationSummary | null;
  refresh: () => void;
};

const BadgeContext = createContext<Ctx>({ summary: null, refresh: () => {} });

export function useBadges() {
  return useContext(BadgeContext);
}

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;

    const load = () =>
      notificationSummary()
        .then((s) => alive && setSummary(s))
        .catch(() => {});

    load();
    const timer = setInterval(load, REFRESH_MS);

    // Coming back to the tab is the moment a stale count is most obvious.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [tick]);

  // Anything arriving on the stream is a reason to recount straight away.
  useLiveEvents("admin", refresh);

  const value = useMemo(() => ({ summary, refresh }), [summary, refresh]);

  return (
    <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>
  );
}

/** How many items are waiting on this menu entry, if any. */
export function badgeFor(
  href: string,
  summary: NotificationSummary | null,
): number {
  if (!summary) return 0;
  if (href === "/admin/leave") return summary.pending.leave;
  if (href === "/admin/payroll") return summary.pending.claims;
  return 0;
}
