"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

const STORAGE_KEY = "hrms_sidebar_collapsed";
const ATTR = "collapsed";

/* ------------------------------------------------------------------ *
 * The <html data-sidebar> attribute is the source of truth: the inline
 * script sets it before paint, Tailwind's `rail:` variant styles off it,
 * and React subscribes to it rather than owning a second copy of state.
 * ------------------------------------------------------------------ */

let listeners: Array<() => void> = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function emit() {
  for (const l of listeners) l();
}

function getSnapshot() {
  return document.documentElement.dataset.sidebar === ATTR;
}

function getServerSnapshot() {
  return false;
}

type SidebarCtx = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};

const Ctx = createContext<SidebarCtx | null>(null);

export function useSidebar() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}

/**
 * Runs synchronously during HTML parsing so the collapsed rail is already
 * styled before the first paint — no flash, no hydration mismatch.
 */
export function SidebarInitScript() {
  const js = `(function(){try{if(localStorage.getItem(${JSON.stringify(
    STORAGE_KEY,
  )})==="1"){document.documentElement.dataset.sidebar=${JSON.stringify(
    ATTR,
  )}}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    const root = document.documentElement;
    const next = root.dataset.sidebar !== ATTR;

    if (next) root.dataset.sidebar = ATTR;
    else delete root.dataset.sidebar;

    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // storage unavailable (private mode) — collapse still works this session
    }
    emit();
  }, []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, toggleCollapsed, mobileOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
