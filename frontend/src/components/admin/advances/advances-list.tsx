"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  Check,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiError,
  advanceAction,
  advanceTone,
  createAdvance,
  deleteAdvance,
  getEligibility,
  listAdvances,
  type AdvanceEligibility,
  type SalaryAdvance,
} from "@/lib/advances";
import { EmployeePicker } from "@/components/admin/employee-picker";
import { type EmployeeListItem } from "@/lib/employees";
import { monthLabel, rupees } from "@/lib/payroll";
import { cn } from "@/lib/utils";

const TH = "h-9 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";
const NUM = `${TD} text-right tabular-nums`;

export function AdvancesList() {
  const [rows, setRows] = useState<SalaryAdvance[] | null>(null);
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("");
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    listAdvances({
      status,
      period: period ? `${period}-01` : undefined,
    })
      .then(setRows)
      .catch(() => setRows([]));
  }, [status, period, reloadKey]);

  async function act(row: SalaryAdvance, action: string) {
    try {
      await advanceAction(row.id, action);
      setReloadKey((k) => k + 1);
      toast.success(action === "cancel" ? "Cancelled" : "Marked paid");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    }
  }

  async function remove(row: SalaryAdvance) {
    if (!window.confirm("Delete this advance?")) return;
    try {
      await deleteAdvance(row.id);
      setReloadKey((k) => k + 1);
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-8 w-[150px] text-xs"
          aria-label="Salary month"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending payout</SelectItem>
            <SelectItem value="paid">Paid out</SelectItem>
            <SelectItem value="recovered">Recovered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Part of the month&apos;s own salary, paid early and netted off that
          month&apos;s payslip.
        </p>
        <Button size="sm" className="ml-auto h-8" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" />
          Give advance
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} pl-4`}>Employee</TableHead>
                <TableHead className={TH}>Salary month</TableHead>
                <TableHead className={`${TH} hidden text-right sm:table-cell`}>
                  Salary
                </TableHead>
                <TableHead className={`${TH} text-right`}>Advance</TableHead>
                <TableHead className={`${TH} text-right`}>% of salary</TableHead>
                <TableHead className={`${TH} hidden md:table-cell`}>Paid on</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} w-[104px] pr-4 text-right`}>
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8} className="pl-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Banknote className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">No salary advances</p>
                      <p className="text-xs text-muted-foreground">
                        Give part of a month&apos;s salary early; it is deducted
                        from that same month&apos;s payslip.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {rows?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className={`${TD} pl-4`}>
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-semibold">
                        {a.employee_name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {a.employee_code}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className={TD}>{monthLabel(a.period)}</TableCell>
                  <TableCell className={`${NUM} hidden sm:table-cell`}>
                    {rupees(a.salary_basis, 0)}
                  </TableCell>
                  <TableCell className={`${NUM} font-semibold`}>
                    {rupees(a.amount, 0)}
                  </TableCell>
                  <TableCell className={NUM}>{a.percent_of_salary}%</TableCell>
                  <TableCell className={`${TD} hidden md:table-cell`}>
                    {a.paid_on ?? "—"}
                    {a.reference && (
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                        {a.reference}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={TD}>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
                        advanceTone(a.status),
                      )}
                    >
                      {a.status}
                    </span>
                  </TableCell>
                  <TableCell className={`${TD} pr-4`}>
                    <div className="flex items-center justify-end gap-1">
                      {/* A recovered advance is settled in a closed payslip, so
                          say so rather than showing an empty cell. */}
                      {a.status === "recovered" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
                              <Lock className="size-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            Already deducted in the{" "}
                            {monthLabel(a.period)} payroll. Move that run back to
                            draft to change it.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <>
                          {a.status === "pending" && (
                            <IconButton
                              label="Mark paid out"
                              icon={Check}
                              variant="brand"
                              size="sm"
                              onClick={() => act(a, "mark_paid")}
                            />
                          )}
                          {a.status === "cancelled" ? (
                            <IconButton
                              label="Reinstate"
                              icon={RotateCcw}
                              variant="brand"
                              size="sm"
                              onClick={() => act(a, "mark_paid")}
                            />
                          ) : (
                            <IconButton
                              label="Cancel"
                              icon={X}
                              variant="neutral"
                              size="sm"
                              onClick={() => act(a, "cancel")}
                            />
                          )}
                          <IconButton
                            label="Delete"
                            icon={Trash2}
                            variant="destructive"
                            size="sm"
                            onClick={() => remove(a)}
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mounted only while open: otherwise the previous selection and its
          stale eligibility survive, and the next advance is offered the full
          amount even though some is already taken. */}
      {open && (
        <GiveDialog
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function GiveDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employee, setEmployee] = useState<EmployeeListItem | null>(null);
  const [period, setPeriod] = useState("");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [payMode, setPayMode] = useState("bank");
  const [reference, setReference] = useState("");
  const [eligibility, setEligibility] = useState<AdvanceEligibility | null>(null);
  const [existing, setExisting] = useState<SalaryAdvance[]>([]);
  const [saving, setSaving] = useState(false);

  // Re-read the limit whenever the employee or month changes, so previously
  // taken advances are always reflected before anything is entered.
  useEffect(() => {
    if (!employee || !period) return;

    let alive = true;
    getEligibility(employee.id, `${period}-01`)
      .then((e) => {
        if (!alive) return;
        setEligibility(e);
        setPercent((p) => p || e.default_percent);
      })
      .catch(() => alive && setEligibility(null));

    listAdvances({ period: `${period}-01` })
      .then(
        (rows) =>
          alive &&
          setExisting(
            rows.filter(
              (r) =>
                r.employee_id === employee.id &&
                ["pending", "paid", "recovered"].includes(r.status),
            ),
          ),
      )
      .catch(() => alive && setExisting([]));

    return () => {
      alive = false;
    };
  }, [employee, period]);

  const salary = Number(eligibility?.monthly_salary ?? 0);
  const available = Number(eligibility?.available ?? 0);
  const computed =
    mode === "percent"
      ? (salary * Number(percent || 0)) / 100
      : Number(amount || 0);

  const overLimit = eligibility !== null && computed > available;
  const balance = Math.max(salary - Number(eligibility?.already_taken ?? 0) - computed, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee || !period) {
      toast.error("Choose an employee and the salary month");
      return;
    }
    setSaving(true);
    try {
      await createAdvance({
        employee_id: employee.id,
        period: `${period}-01`,
        percent: mode === "percent" ? percent : null,
        amount: mode === "amount" ? amount : null,
        paid_on: paidOn || null,
        payment_mode: payMode,
        reference: reference.trim() || null,
      });
      toast.success("Advance recorded — it will be netted off that month's pay");
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not record");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle>Give a salary advance</DialogTitle>
          <DialogDescription>
            Pays out part of the month&apos;s salary early. The same amount is
            deducted from that month&apos;s payslip — there is nothing to repay.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <div className="grid max-h-[62vh] overflow-y-auto md:grid-cols-[1fr_300px]">
            {/* ---- form ---- */}
            <div className="space-y-5 px-6 py-5">
              <Group title="Who and when">
                <Field label="Employee" required className="sm:col-span-2">
                  <EmployeePicker
                    value={employee?.id ?? null}
                    onChange={(e) => {
                      setEmployee(e);
                      setEligibility(null);
                      setExisting([]);
                    }}
                  />
                </Field>
                <Field label="Salary month" required className="sm:col-span-2">
                  <Input
                    type="month"
                    value={period}
                    onChange={(e) => {
                      setPeriod(e.target.value);
                      setEligibility(null);
                      setExisting([]);
                    }}
                  />
                </Field>
              </Group>

              <Group title="How much">
                <div className="sm:col-span-2">
                  <div className="flex gap-1.5">
                    {(["percent", "amount"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                          mode === m
                            ? "border-brand-ink bg-brand-ink text-white"
                            : "border-border bg-card text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {m === "percent" ? "By percentage" : "By amount"}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === "percent" ? (
                  <Field label="Percent of salary" suffix="%">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={percent}
                      onChange={(e) => setPercent(e.target.value)}
                      disabled={!eligibility}
                    />
                  </Field>
                ) : (
                  <Field label="Amount">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!eligibility}
                    />
                  </Field>
                )}

                <Field label="Paid out on" hint="Leave blank to record as pending">
                  <Input
                    type="date"
                    value={paidOn}
                    onChange={(e) => setPaidOn(e.target.value)}
                  />
                </Field>
              </Group>

              <Group title="Payment">
                <Field label="Mode">
                  <Select value={payMode} onValueChange={setPayMode}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank transfer</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Reference">
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="UTR / voucher no."
                  />
                </Field>
              </Group>
            </div>

            {/* ---- live summary ---- */}
            <aside className="border-t border-border/60 bg-muted/30 px-5 py-5 md:border-l md:border-t-0">
              {!eligibility ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Banknote className="size-4" />
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Pick an employee and month to see how much may be drawn.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="truncate text-sm font-semibold">
                      {employee?.full_name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {employee?.employee_code}
                    </p>
                  </div>

                  <dl className="space-y-1.5 text-xs">
                    <Line label="Monthly salary" value={rupees(salary, 0)} />
                    <Line
                      label={`Limit (${eligibility.max_percent}%)`}
                      value={rupees(eligibility.max_amount, 0)}
                    />
                  </dl>

                  {existing.length > 0 && (
                    <div className="border-t border-border/60 pt-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Already taken
                      </p>
                      <dl className="space-y-1 text-xs">
                        {existing.map((e) => (
                          <Line
                            key={e.id}
                            label={`${e.percent ? `${e.percent}%` : "Amount"} · ${e.status}`}
                            value={`−${rupees(e.amount, 0)}`}
                            muted
                          />
                        ))}
                      </dl>
                    </div>
                  )}

                  <div className="border-t border-border/60 pt-2">
                    <Line
                      label="Still available"
                      value={rupees(available, 0)}
                      strong
                      tone={available <= 0 ? "text-destructive" : undefined}
                    />
                  </div>

                  {computed > 0 && (
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-2.5",
                        overLimit
                          ? "border-destructive/30 bg-destructive/10"
                          : "border-primary/25 bg-primary/10",
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        This advance
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 text-lg font-semibold tabular-nums",
                          overLimit ? "text-destructive" : "text-brand-ink",
                        )}
                      >
                        {rupees(computed.toFixed(2), 0)}
                      </p>
                      {overLimit ? (
                        <p className="mt-1 text-[11px] text-destructive">
                          Over the limit by{" "}
                          {rupees((computed - available).toFixed(2), 0)}.
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          About {rupees(balance.toFixed(2), 0)} would remain to
                          come on the payslip.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>

          <DialogFooter className="border-t border-border/60 px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || overLimit || !eligibility}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Banknote className="size-4" />
              )}
              Give advance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  suffix,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  suffix?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold">
        {label}
        {suffix && (
          <span className="ml-1 font-normal text-muted-foreground">{suffix}</span>
        )}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("truncate", muted ? "text-muted-foreground" : "")}>
        {label}
      </dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          strong ? "font-semibold" : "",
          muted ? "text-muted-foreground" : "",
          tone,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
