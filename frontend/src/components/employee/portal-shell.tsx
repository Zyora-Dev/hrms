"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  FileText,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  Receipt,
  Settings,
  TriangleAlert,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { Logo } from "@/components/landing/logo";
import {
  employeeChangePassword,
  employeeLogout,
  employeeMe,
  type EmployeeMe,
} from "@/lib/employee-auth";
import { useLiveEvents } from "@/lib/live";
import { cn } from "@/lib/utils";
import {
  AttendancePanel,
  ClaimsPanel,
  DocumentsPanel,
  LeavePanel,
  PayPanel,
} from "./portal-panels";
import { Avatar, ProfilePanel, SettingsPanel } from "./profile-panel";
import {
  DevicesPanel,
  FormsPanel,
  HolidaysPanel,
  NotificationsPanel,
  RegularisationPanel,
} from "./portal-extras";

const NAV = [
  { value: "profile", label: "My profile", icon: UserRound },
  { value: "attendance", label: "Attendance", icon: CalendarCheck },
  { value: "leave", label: "Leave", icon: CalendarOff },
  { value: "pay", label: "Pay", icon: Wallet },
  { value: "claims", label: "Reimbursements", icon: Receipt },
  { value: "holidays", label: "Holidays", icon: CalendarDays },
  { value: "documents", label: "Documents", icon: FileText },
  { value: "alerts", label: "Notifications", icon: Bell },
  { value: "settings", label: "Settings", icon: Settings },
] as const;

const VALUES = NAV.map((n) => n.value) as readonly string[];
const DEFAULT_TAB = "profile";

export function PortalShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [me, setMe] = useState<EmployeeMe | null>(null);
  const [checked, setChecked] = useState(false);
  const [month, setMonth] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const requested = searchParams.get("tab");
  const tab = VALUES.includes(requested ?? "")
    ? (requested as string)
    : DEFAULT_TAB;

  useEffect(() => {
    let alive = true;
    employeeMe().then((data) => {
      if (!alive) return;
      if (!data) {
        router.replace("/employee/login");
        return;
      }
      setMe(data);
      // Read the clock here rather than at render, where it is not allowed.
      const now = new Date();
      setMonth(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      );
      setChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [router]);

  // The admin deciding on something of theirs should show up without a
  // refresh; `version` is what the panels watch to reload themselves.
  const [version, setVersion] = useState(0);
  useLiveEvents(
    "employee",
    (event) => {
      setVersion((v) => v + 1);
      if (event.message) toast.info(event.message);
    },
    checked,
  );

  function go(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TAB) next.delete("tab");
    else next.set("tab", value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setMenuOpen(false);
  }

  if (!checked || !me || !month) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-16">
        <Skeleton className="h-12 w-64 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const title = NAV.find((n) => n.value === tab)?.label ?? "My profile";

  return (
    <div className="min-h-dvh bg-background">
      {/* scrim behind the drawer on small screens */}
      <div
        onClick={() => setMenuOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden",
          menuOpen ? "block" : "hidden",
        )}
      />

      <aside
        className={cn(
          // `dark` scopes the navy palette to the rail, as on the admin side.
          "dark fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col",
          "border-r border-border/60 bg-sidebar text-foreground",
          "transition-transform duration-200 ease-out lg:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border/60 px-5">
          <Logo />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="text-white/70 hover:text-white lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
          <Avatar photo={me.photo_path} name={me.full_name} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {me.full_name}
            </p>
            <p className="truncate font-mono text-[11px] text-white/70">
              {me.employee_code}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map(({ value, label, icon: Icon }) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => go(value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-white font-semibold text-brand-ink shadow-sm"
                    : "text-white/85 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-border/60 p-3">
          <button
            type="button"
            onClick={async () => {
              await employeeLogout();
              router.replace("/employee/login");
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/85 transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <LogOut className="size-[18px] shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-1.5 text-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <h1 className="truncate text-base font-bold">{title}</h1>

          <div className="ml-auto flex items-center gap-2">
            <Avatar photo={me.photo_path} name={me.full_name} size={32} />
          </div>
        </header>

        <main className="flex-1 space-y-5 p-4 sm:p-6">
          {me.must_change_password && (
            <PasswordPrompt
              onDone={() => setMe({ ...me, must_change_password: false })}
            />
          )}

          {tab === "profile" && <ProfilePanel />}
          {tab === "attendance" && (
            <div className="space-y-5">
              <AttendancePanel month={month} />
              <RegularisationPanel version={version} />
            </div>
          )}
          {tab === "leave" && <LeavePanel version={version} />}
          {tab === "pay" && <PayPanel version={version} />}
          {tab === "claims" && <ClaimsPanel version={version} />}
          {tab === "holidays" && <HolidaysPanel year={Number(month.slice(0, 4))} />}
          {tab === "documents" && (
            <div className="space-y-5">
              <FormsPanel />
              <DocumentsPanel />
            </div>
          )}
          {tab === "alerts" && <NotificationsPanel version={version} />}
          {tab === "settings" && (
            <div className="space-y-5">
              <SettingsPanel />
              <DevicesPanel />
            </div>
          )}
        </main>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}

function PasswordPrompt({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await employeeChangePassword(current, next);
      toast.success("Password changed");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <TriangleAlert className="size-4 text-amber-700" />
        Choose your own password
      </p>
      <p className="mt-1 text-xs text-foreground/80">
        You are still using the one HR gave you. At least 10 characters, with a
        letter and a number.
      </p>

      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Current</Label>
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="h-9"
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">New</Label>
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="h-9"
            autoComplete="new-password"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            className="h-9"
            disabled={saving || !current || next.length < 10}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
