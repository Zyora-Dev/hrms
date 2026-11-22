"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckCheck,
  Download,
  FileBadge,
  Laptop,
  Loader2,
  LogOut,
  PenLine,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  downloadForm130,
  myFormYears,
  myHolidays,
  myNotifications,
  myRegularisations,
  mySessions,
  readAllMine,
  requestRegularisation,
  revokeMyOtherSessions,
  revokeMySession,
  withdrawRegularisation,
  type MyFormYear,
  type MyHoliday,
  type MyNotification,
  type MyRegularisation,
  type MySession,
} from "@/lib/employee-auth";
import { Card } from "./portal-panels";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]?.slice(0, 3)}`;
}

function rupees(value: string) {
  const n = Number(value);
  return Number.isNaN(n)
    ? value
    : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const TONES: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-800",
  approved: "bg-emerald-500/15 text-emerald-800",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-foreground/70",
};

function Tag({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
        TONES[value] ?? "bg-muted text-foreground/70",
      )}
    >
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export function DevicesPanel() {
  const [rows, setRows] = useState<MySession[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    mySessions()
      .then((s) => alive && setRows(s))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const others = (rows ?? []).filter((r) => !r.is_current).length;

  async function run(work: Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await work;
      toast.success(done);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Where you are signed in"
      description="Each device holding a live session. Signing one out stops it on its next request."
      action={
        others > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy}
            onClick={() =>
              run(revokeMyOtherSessions(), "Other devices signed out")
            }
          >
            <LogOut className="size-3.5" />
            Sign out {others} other{others === 1 ? "" : "s"}
          </Button>
        ) : null
      }
    >
      {!rows ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  row.is_current
                    ? "bg-emerald-500/12 text-emerald-700"
                    : "bg-muted text-foreground/60",
                )}
              >
                <Laptop className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  {row.device ?? "Unknown device"}
                  {row.is_current && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      This device
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-foreground/70">
                  {row.ip_address ?? "unknown address"} · since{" "}
                  {row.created_at.slice(0, 10)}
                </p>
              </div>
              {!row.is_current && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={busy}
                  onClick={() =>
                    run(revokeMySession(row.id), "Device signed out")
                  }
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function NotificationsPanel({ version = 0 }: { version?: number }) {
  const [rows, setRows] = useState<MyNotification[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    myNotifications()
      .then((n) => alive && setRows(n))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [reloadKey, version]);

  const unread = (rows ?? []).filter((r) => !r.read_at).length;

  return (
    <Card
      title="Notifications"
      description="What HR has decided on your requests."
      action={
        unread > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={async () => {
              await readAllMine().catch(() => {});
              setReloadKey((k) => k + 1);
            }}
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        ) : null
      }
    >
      {!rows ? (
        <Skeleton className="h-28 w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-foreground/80">
          Nothing yet. Decisions on your leave, claims and attendance
          corrections appear here.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((row) => (
            <li
              key={row.id}
              className={cn(
                "flex gap-3 px-1 py-3",
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
                <Bell className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs",
                    row.read_at ? "font-medium" : "font-bold",
                  )}
                >
                  {row.title}
                </p>
                {row.body && (
                  <p className="mt-0.5 text-[11px] text-foreground/75">
                    {row.body}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-foreground/60">
                {row.created_at.slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function HolidaysPanel({ year }: { year: number }) {
  const [current, setCurrent] = useState(year);
  const [rows, setRows] = useState<MyHoliday[] | null>(null);

  useEffect(() => {
    let alive = true;
    myHolidays(current)
      .then((h) => alive && setRows(h))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [current]);

  const upcoming = (rows ?? []).filter((r) => !r.is_past);

  return (
    <Card
      title="Holiday calendar"
      description={
        rows
          ? `${rows.length} holidays this year · ${upcoming.length} still to come`
          : undefined
      }
      action={
        <Select
          value={String(current)}
          onValueChange={(v) => setCurrent(Number(v))}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[year - 1, year, year + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {!rows ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-foreground/80">
          No holidays published for {current}.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((h) => (
            <li
              key={`${h.name}-${h.holiday_date}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5",
                h.is_past && "opacity-55",
              )}
            >
              <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 leading-none text-brand-ink">
                <span className="text-sm font-bold">
                  {h.holiday_date.slice(8)}
                </span>
                <span className="text-[9px] uppercase">
                  {MONTHS[Number(h.holiday_date.slice(5, 7)) - 1]?.slice(0, 3)}
                </span>
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{h.name}</p>
                <p className="text-[11px] capitalize text-foreground/70">
                  {h.weekday} · {h.kind}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const CORRECTION_STATUSES = [
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half day" },
  { value: "on_leave", label: "On leave" },
  { value: "absent", label: "Absent" },
];

export function RegularisationPanel({ version = 0 }: { version?: number }) {
  const [rows, setRows] = useState<MyRegularisation[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    myRegularisations()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [reloadKey, version]);

  async function withdraw(id: number) {
    try {
      await withdrawRegularisation(id);
      toast.success("Request withdrawn");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw");
    }
  }

  return (
    <>
      <Card
        title="Attendance corrections"
        description="Scanner missed you? Ask HR to put one day right."
        action={
          <Button size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
            <PenLine className="size-3.5" />
            Request a correction
          </Button>
        }
      >
        {!rows ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-foreground/80">
            You have not asked for any corrections.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">
                    {dayLabel(r.attendance_date)}
                    {r.current_status && (
                      <span className="ml-2 font-normal text-foreground/70">
                        recorded as {r.current_status.replace(/_/g, " ")}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-foreground/70">
                    Asked for{" "}
                    {[
                      r.requested_status?.replace(/_/g, " "),
                      r.requested_in && `in ${r.requested_in.slice(0, 5)}`,
                      r.requested_out && `out ${r.requested_out.slice(0, 5)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    · {r.reason}
                    {r.decision_note ? ` · ${r.decision_note}` : ""}
                  </p>
                </div>
                <Tag value={r.status} />
                {r.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={() => withdraw(r.id)}
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && (
        <CorrectionDialog
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

function CorrectionDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [day, setDay] = useState("");
  const [status, setStatus] = useState("present");
  const [inAt, setInAt] = useState("");
  const [outAt, setOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await requestRegularisation({
        attendance_date: day,
        requested_status: status || null,
        requested_in: inAt || null,
        requested_out: outAt || null,
        reason: reason.trim(),
      });
      toast.success("Sent to HR");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a correction</DialogTitle>
          <DialogDescription>
            HR checks this against the device log before changing anything.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Which day</Label>
              <Input
                type="date"
                required
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Should have been</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRECTION_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">In at (optional)</Label>
              <Input
                type="time"
                value={inAt}
                onChange={(e) => setInAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Out at (optional)</Label>
              <Input
                type="time"
                value={outAt}
                onChange={(e) => setOutAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">What happened</Label>
            <Textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="The reader at the gate was down, security logged me in the register"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !day || reason.trim().length < 5}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PenLine className="size-4" />
              )}
              Send request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

export function FormsPanel() {
  const [years, setYears] = useState<MyFormYear[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    myFormYears()
      .then((y) => alive && setYears(y))
      .catch(() => alive && setYears([]));
    return () => {
      alive = false;
    };
  }, []);

  async function download(year: MyFormYear) {
    setBusy(year.year);
    try {
      await downloadForm130(year.year, year.label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Not available yet");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Tax forms"
      description="Form 130 — your certificate of salary paid and tax deducted, one per financial year."
    >
      {!years ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : years.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-foreground/80">
          Nothing to certify yet. A form appears once a month&rsquo;s payroll
          has been approved.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {years.map((year) => (
            <li
              key={year.year}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink">
                <FileBadge className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">FY {year.label}</p>
                <p className="text-[11px] text-foreground/70">
                  {rupees(year.gross)} paid over {year.months} month
                  {year.months === 1 ? "" : "s"} · {rupees(year.tds)} tax
                  deducted
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={busy === year.year}
                onClick={() => download(year)}
              >
                {busy === year.year ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Form 130
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export { CalendarDays };
