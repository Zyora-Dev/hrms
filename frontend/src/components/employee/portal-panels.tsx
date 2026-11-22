"use client";

import { useEffect, useState } from "react";
import {
  CalendarPlus,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Receipt,
  Wallet,
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
import { API_URL } from "@/lib/auth";
import {
  CLAIM_CATEGORIES,
  applyForLeave,
  downloadPayslip,
  myAttendance,
  myClaims,
  myDocuments,
  myLeaveBalances,
  myLeaveRequests,
  myLeaveTypes,
  myPayslips,
  raiseClaim,
  withdrawClaim,
  withdrawLeave,
  type MyAttendanceMonth,
  type MyClaim,
  type MyDocument,
  type MyLeaveBalance,
  type MyLeaveRequest,
  type MyLeaveType,
  type MyPayslip,
} from "@/lib/employee-auth";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function dayLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]?.slice(0, 3)}`;
}

function clock(iso: string | null) {
  return iso ? iso.split("T")[1]?.slice(0, 5) ?? "—" : "—";
}

function hours(minutes: number) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function rupees(value: string | number) {
  const n = Number(value);
  return Number.isNaN(n)
    ? String(value)
    : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const STATUS_TONES: Record<string, string> = {
  present: "bg-primary/15 text-primary",
  half_day: "bg-amber-500/20 text-amber-800",
  absent: "bg-destructive/15 text-destructive",
  weekly_off: "bg-muted text-foreground/70",
  holiday: "bg-sky-500/15 text-sky-800",
  on_leave: "bg-violet-500/15 text-violet-800",
  not_marked: "bg-muted text-foreground/60",
  pending: "bg-amber-500/20 text-amber-800",
  approved: "bg-emerald-500/15 text-emerald-800",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-foreground/70",
  paid: "bg-primary/15 text-primary",
};

function Tag({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
        STATUS_TONES[value] ?? "bg-muted text-foreground/70",
      )}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function Card({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-foreground/70">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground/60">
        <Icon className="size-4" />
      </span>
      <p className="text-xs text-foreground/80">{text}</p>
    </div>
  );
}

function Totals({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-muted/50 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-foreground/70">{label}</p>
          <p className="mt-0.5 text-lg font-bold tracking-tight">{value}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function AttendancePanel({ month }: { month: string }) {
  const [current, setCurrent] = useState(month);
  const [data, setData] = useState<MyAttendanceMonth | null>(null);

  useEffect(() => {
    let alive = true;
    myAttendance(current)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [current]);

  return (
    <Card
      title="My attendance"
      description="As recorded by the device and your HR team. Ask HR if something looks wrong."
      action={
        <Input
          type="month"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="h-8 w-[150px] text-xs"
        />
      }
    >
      {!data ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <div className="space-y-4">
          <Totals
            items={[
              ["Payable days", String(Number(data.present))],
              ["Absent", String(data.absent)],
              ["On leave", String(data.on_leave)],
              ["Overtime", hours(data.overtime_minutes)],
            ]}
          />

          {data.days.length === 0 ? (
            <Empty icon={FileText} text="Nothing recorded for this month yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border/60">
                  <tr className="text-xs font-bold">
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Shift</th>
                    <th className="px-2 py-2 text-left">In</th>
                    <th className="px-2 py-2 text-left">Out</th>
                    <th className="px-2 py-2 text-right">Worked</th>
                    <th className="px-2 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data.days.map((day) => (
                    <tr key={day.attendance_date} className="text-xs">
                      <td className="px-2 py-1.5 font-semibold">
                        {dayLabel(day.attendance_date)}
                      </td>
                      <td className="px-2 py-1.5">{day.shift_name ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono">
                        {clock(day.first_in)}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        {clock(day.last_out)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {hours(day.worked_minutes)}
                        {day.late_minutes > 0 && (
                          <span className="ml-1.5 text-amber-800">
                            {day.late_minutes}m late
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Tag value={day.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function LeavePanel({ version = 0 }: { version?: number }) {
  const [balances, setBalances] = useState<MyLeaveBalance[] | null>(null);
  const [requests, setRequests] = useState<MyLeaveRequest[]>([]);
  const [types, setTypes] = useState<MyLeaveType[]>([]);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    myLeaveBalances()
      .then((b) => alive && setBalances(b))
      .catch(() => alive && setBalances([]));
    myLeaveRequests()
      .then((r) => alive && setRequests(r))
      .catch(() => {});
    myLeaveTypes()
      .then((t) => alive && setTypes(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [reloadKey, version]);

  async function withdraw(id: number) {
    try {
      await withdrawLeave(id);
      toast.success("Request withdrawn");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw");
    }
  }

  return (
    <div className="space-y-6">
      <Card title="My leave balance" description="As it stands today.">
        {!balances ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : balances.length === 0 ? (
          <Empty icon={CalendarPlus} text="No leave types apply to you yet." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {balances.map((b) => (
              <li
                key={b.leave_type_id}
                className="rounded-lg border border-border/60 px-3 py-2.5"
              >
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{b.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-foreground/70">
                    {b.code}
                  </span>
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  {Number(b.available)}
                  <span className="ml-1 text-xs font-medium text-foreground/70">
                    left
                  </span>
                </p>
                <p className="text-[11px] text-foreground/70">
                  {Number(b.used)} taken of {Number(b.entitled)}
                  {Number(b.pending) > 0 && (
                    <span className="text-amber-800">
                      {" "}
                      · {Number(b.pending)} awaiting approval
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="My requests"
        description="Pending ones can still be withdrawn."
        action={
          <Button size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" />
            Apply for leave
          </Button>
        }
      >
        {requests.length === 0 ? (
          <Empty icon={CalendarPlus} text="You have not applied for any leave." />
        ) : (
          <ul className="divide-y divide-border/50">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">
                    {r.leave_type_name} · {Number(r.days)}{" "}
                    {Number(r.days) === 1 ? "day" : "days"}
                  </p>
                  <p className="text-[11px] text-foreground/70">
                    {dayLabel(r.start_date)}
                    {r.start_date !== r.end_date && ` – ${dayLabel(r.end_date)}`}
                    {r.reason ? ` · ${r.reason}` : ""}
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
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && (
        <ApplyDialog
          types={types}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function ApplyDialog({
  types,
  onClose,
  onDone,
}: {
  types: MyLeaveType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ? String(types[0].id) : "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await applyForLeave({
        leave_type_id: Number(typeId),
        start_date: from,
        end_date: to || from,
        is_half_day: half,
        reason: reason.trim() || null,
      });
      toast.success("Sent to HR for approval");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            Your balance is checked when HR approves it, not now.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Leave type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">From</Label>
              <Input
                type="date"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">To</Label>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={half}
              onChange={(e) => setHalf(e.target.checked)}
              className="size-4 accent-[var(--brand-ink)]"
            />
            Half day
          </label>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Anything HR should know"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !typeId || !from}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarPlus className="size-4" />
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

export function PayPanel({ version = 0 }: { version?: number }) {
  const [slips, setSlips] = useState<MyPayslip[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    myPayslips()
      .then((s) => alive && setSlips(s))
      .catch(() => alive && setSlips([]));
    return () => {
      alive = false;
    };
  }, [version]);

  async function download(slip: MyPayslip) {
    setBusy(slip.run_id);
    try {
      await downloadPayslip(slip.run_id, slip.period);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Not available");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="My pay"
      description="Payslips appear here once the month has been approved."
    >
      {!slips ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : slips.length === 0 ? (
        <Empty icon={Wallet} text="No approved payslip yet." />
      ) : (
        <ul className="divide-y divide-border/50">
          {slips.map((slip) => (
            <li key={slip.run_id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{monthLabel(slip.period)}</p>
                  <p className="text-[11px] text-foreground/70">
                    Gross {rupees(slip.gross_pay)} · deductions{" "}
                    {rupees(slip.total_deductions)}
                    {Number(slip.lop_days) > 0 &&
                      ` · ${Number(slip.lop_days)} LOP days`}
                  </p>
                </div>
                <p className="text-base font-bold tabular-nums">
                  {rupees(slip.net_pay)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={busy === slip.run_id}
                  onClick={() => download(slip)}
                >
                  {busy === slip.run_id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  Payslip
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() =>
                    setOpen(open === slip.run_id ? null : slip.run_id)
                  }
                >
                  {open === slip.run_id ? "Hide" : "Breakdown"}
                </Button>
              </div>

              {open === slip.run_id && (
                <div className="mt-3 grid gap-4 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
                  <Lines title="Earnings" rows={slip.earnings} />
                  <Lines title="Deductions" rows={slip.deductions} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Lines({
  title,
  rows,
}: {
  title: string;
  rows: { code: string; name: string; amount: string }[];
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.04em]">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.length === 0 && <li className="text-xs text-foreground/70">None</li>}
        {rows.map((line, i) => (
          <li key={`${line.code}-${i}`} className="flex justify-between text-xs">
            <span className="truncate pr-2">{line.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {rupees(line.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ClaimsPanel({ version = 0 }: { version?: number }) {
  const [claims, setClaims] = useState<MyClaim[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    myClaims()
      .then((c) => alive && setClaims(c))
      .catch(() => alive && setClaims([]));
    return () => {
      alive = false;
    };
  }, [reloadKey, version]);

  async function withdraw(id: number) {
    try {
      await withdrawClaim(id);
      toast.success("Claim withdrawn");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw");
    }
  }

  return (
    <>
      <Card
        title="My reimbursements"
        description="Attach the receipt and HR will settle it with your pay or separately."
        action={
          <Button size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" />
            New claim
          </Button>
        }
      >
        {!claims ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : claims.length === 0 ? (
          <Empty icon={Receipt} text="You have not claimed anything yet." />
        ) : (
          <ul className="divide-y divide-border/50">
            {claims.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">
                    {claim.title}
                    <span className="ml-2 font-mono text-[10px] text-foreground/70">
                      {claim.reference}
                    </span>
                  </p>
                  <p className="text-[11px] capitalize text-foreground/70">
                    {claim.category} · spent {dayLabel(claim.spent_on)}
                    {claim.paid_period &&
                      ` · paid with ${monthLabel(claim.paid_period)}`}
                    {claim.decision_note ? ` · ${claim.decision_note}` : ""}
                  </p>
                </div>

                {claim.receipt_path && (
                  <a
                    href={`${API_URL}${claim.receipt_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground/70 hover:text-foreground"
                    aria-label="View receipt"
                  >
                    <Paperclip className="size-3.5" />
                  </a>
                )}

                <p className="text-sm font-bold tabular-nums">
                  {rupees(claim.approved_amount ?? claim.amount)}
                  {claim.approved_amount &&
                    claim.approved_amount !== claim.amount && (
                      <span className="ml-1.5 text-[11px] font-normal text-foreground/70 line-through">
                        {rupees(claim.amount)}
                      </span>
                    )}
                </p>

                <Tag value={claim.status} />

                {claim.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={() => withdraw(claim.id)}
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
        <ClaimDialog
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

function ClaimDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [category, setCategory] = useState<string>(CLAIM_CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [spentOn, setSpentOn] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("title", title.trim());
      form.append("spent_on", spentOn);
      form.append("amount", amount);
      if (description.trim()) form.append("description", description.trim());
      if (receipt) form.append("receipt", receipt);

      await raiseClaim(form);
      toast.success("Claim sent to HR");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not raise it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Claim an expense</DialogTitle>
          <DialogDescription>
            Attach the receipt — claims without one take longer to approve.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAIM_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">What was it for</Label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Client visit — Chennai"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Date of spending</Label>
            <Input
              type="date"
              required
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Details</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cab fare and tolls"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Receipt</Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            <p className="text-[11px] text-foreground/70">
              Image or PDF, up to 5 MB.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !title.trim() || !spentOn || !amount}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Receipt className="size-4" />
              )}
              Send claim
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

export function DocumentsPanel() {
  const [docs, setDocs] = useState<MyDocument[] | null>(null);

  useEffect(() => {
    let alive = true;
    myDocuments()
      .then((d) => alive && setDocs(d))
      .catch(() => alive && setDocs([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card
      title="My documents"
      description="Everything HR has on file for you, plus anything you uploaded."
    >
      {!docs ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : docs.length === 0 ? (
        <Empty icon={FileText} text="Nothing on file yet." />
      ) : (
        <ul className="divide-y divide-border/50">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{doc.title}</p>
                <p className="text-[11px] capitalize text-foreground/70">
                  {doc.kind.replace(/_/g, " ")}
                  {doc.uploaded_at ? ` · ${doc.uploaded_at.slice(0, 10)}` : ""}
                </p>
              </div>
              <a
                href={`${API_URL}${doc.file_path}`}
                target="_blank"
                rel="noreferrer"
                download
              >
                <Button size="sm" variant="outline" className="h-8 text-xs">
                  <Download className="size-3.5" />
                  Open
                </Button>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
