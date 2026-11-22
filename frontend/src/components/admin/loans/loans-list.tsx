"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  HandCoins,
  Loader2,
  Pause,
  Play,
  Plus,
  SkipForward,
  Trash2,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiError,
  INTEREST_METHODS,
  createLoan,
  deleteLoan,
  getLoan,
  instalmentTone,
  listLoans,
  loanAction,
  loanTone,
  skipInstalment,
  type Loan,
  type LoanDetail,
} from "@/lib/loans";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";
import { monthLabel, rupees } from "@/lib/payroll";
import { cn } from "@/lib/utils";

const TH = "h-9 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";
const NUM = `${TD} text-right tabular-nums`;

export function LoansList() {
  const [rows, setRows] = useState<Loan[] | null>(null);
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    listLoans({ status })
      .then(setRows)
      .catch(() => setRows([]));
  }, [status, reloadKey]);

  async function act(loan: Loan, action: string) {
    const verb = { hold: "hold", resume: "resume", foreclose: "close" }[action];
    if (action === "foreclose" && !window.confirm(
      `Close ${loan.reference}? Remaining instalments are waived and will not be recovered through payroll.`,
    )) {
      return;
    }
    try {
      await loanAction(loan.id, action);
      setReloadKey((k) => k + 1);
      if (detail?.id === loan.id) setDetail(await getLoan(loan.id));
      toast.success(`Loan ${verb}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    }
  }

  async function remove(loan: Loan) {
    if (!window.confirm(`Delete ${loan.reference}?`)) return;
    try {
      await deleteLoan(loan.id);
      setReloadKey((k) => k + 1);
      if (detail?.id === loan.id) setDetail(null);
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Instalments are deducted automatically when payroll runs for the month
          they fall due.
        </p>
        <Button size="sm" className="ml-auto h-8" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" />
          New loan
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} pl-4`}>Reference</TableHead>
                <TableHead className={TH}>Employee</TableHead>
                <TableHead className={`${TH} text-right`}>Principal</TableHead>
                <TableHead className={`${TH} text-right`}>EMI</TableHead>
                <TableHead className={`${TH} hidden text-right sm:table-cell`}>
                  Recovered
                </TableHead>
                <TableHead className={`${TH} text-right`}>Outstanding</TableHead>
                <TableHead className={`${TH} hidden md:table-cell`}>Next due</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} w-[110px] pr-4 text-right`}>
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9} className="pl-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <HandCoins className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">No loans</p>
                      <p className="text-xs text-muted-foreground">
                        Create one and the EMI is recovered each month.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {rows?.map((l) => (
                <TableRow
                  key={l.id}
                  className="cursor-pointer"
                  onClick={async () => setDetail(await getLoan(l.id))}
                >
                  <TableCell className={`${TD} pl-4`}>
                    <span className="font-mono font-semibold">{l.reference}</span>
                    <span className="ml-1.5 text-[11px] capitalize text-muted-foreground">
                      {l.kind}
                      {Number(l.interest_rate) > 0 &&
                        ` · ${l.interest_rate}% ${l.interest_method}`}
                    </span>
                  </TableCell>
                  <TableCell className={TD}>
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-semibold">
                        {l.employee_name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {l.employee_code}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className={NUM}>{rupees(l.principal, 0)}</TableCell>
                  <TableCell className={NUM}>{rupees(l.emi, 0)}</TableCell>
                  <TableCell className={`${NUM} hidden sm:table-cell`}>
                    {rupees(l.paid_amount, 0)}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {l.paid_instalments}/{l.instalments}
                    </span>
                  </TableCell>
                  <TableCell className={`${NUM} font-semibold`}>
                    {rupees(l.outstanding, 0)}
                  </TableCell>
                  <TableCell className={`${TD} hidden md:table-cell`}>
                    {l.next_due ? monthLabel(l.next_due) : "—"}
                  </TableCell>
                  <TableCell className={TD}>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
                        loanTone(l.status),
                      )}
                    >
                      {l.status.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell
                    className={`${TD} pr-4`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {l.status === "active" && (
                        <IconButton
                          label="Pause recovery"
                          icon={Pause}
                          variant="neutral"
                          size="sm"
                          onClick={() => act(l, "hold")}
                        />
                      )}
                      {l.status === "on_hold" && (
                        <IconButton
                          label="Resume recovery"
                          icon={Play}
                          variant="brand"
                          size="sm"
                          onClick={() => act(l, "resume")}
                        />
                      )}
                      {l.status !== "closed" && (
                        <IconButton
                          label="Close / foreclose"
                          icon={Ban}
                          variant="neutral"
                          size="sm"
                          onClick={() => act(l, "foreclose")}
                        />
                      )}
                      <IconButton
                        label="Delete"
                        icon={Trash2}
                        variant="destructive"
                        size="sm"
                        disabled={l.paid_instalments > 0}
                        onClick={() => remove(l)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <ScheduleDialog
        loan={detail}
        onClose={() => setDetail(null)}
        onChanged={async (id) => {
          setDetail(await getLoan(id));
          setReloadKey((k) => k + 1);
        }}
      />

      <CreateDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          setReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
}

function ScheduleDialog({
  loan,
  onClose,
  onChanged,
}: {
  loan: LoanDetail | null;
  onClose: () => void;
  onChanged: (id: number) => void;
}) {
  if (!loan) return null;

  return (
    <Dialog open={!!loan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/60 p-5">
          <DialogTitle>
            {loan.reference} · {loan.employee_name}
          </DialogTitle>
          <DialogDescription>
            {rupees(loan.principal)} over {loan.instalments} instalments
            {Number(loan.interest_rate) > 0
              ? ` at ${loan.interest_rate}% ${loan.interest_method}`
              : ", interest-free"}
            {loan.purpose ? ` · ${loan.purpose}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] overflow-y-auto p-5">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Total payable" value={rupees(loan.total_payable, 0)} />
            <Stat label="Recovered" value={rupees(loan.paid_amount, 0)} />
            <Stat
              label="Outstanding"
              value={rupees(loan.outstanding, 0)}
              tone="text-brand-ink"
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TH}>#</TableHead>
                <TableHead className={TH}>Due</TableHead>
                <TableHead className={`${TH} text-right`}>Principal</TableHead>
                <TableHead className={`${TH} text-right`}>Interest</TableHead>
                <TableHead className={`${TH} text-right`}>Amount</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} w-9`} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loan.schedule.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className={TD}>{i.seq}</TableCell>
                  <TableCell className={TD}>{monthLabel(i.due_period)}</TableCell>
                  <TableCell className={NUM}>{rupees(i.principal_part, 0)}</TableCell>
                  <TableCell className={NUM}>
                    {Number(i.interest_part) ? rupees(i.interest_part, 0) : "—"}
                  </TableCell>
                  <TableCell className={`${NUM} font-semibold`}>
                    {rupees(i.amount, 0)}
                  </TableCell>
                  <TableCell
                    className={cn(TD, "capitalize", instalmentTone(i.status))}
                  >
                    {i.status}
                  </TableCell>
                  <TableCell className={TD}>
                    {i.status === "pending" && loan.status !== "closed" && (
                      <IconButton
                        label="Skip this month"
                        icon={SkipForward}
                        variant="neutral"
                        size="sm"
                        onClick={async () => {
                          try {
                            await skipInstalment(loan.id, i.seq);
                            onChanged(loan.id);
                            toast.success("Skipped — moved to the end");
                          } catch (err) {
                            toast.error(
                              err instanceof ApiError
                                ? err.message
                                : "Could not skip",
                            );
                          }
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="border-t border-border/60 p-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-sm font-semibold tabular-nums", tone)}>
        {value}
      </p>
    </div>
  );
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [instalments, setInstalments] = useState("6");
  const [method, setMethod] = useState("none");
  const [rate, setRate] = useState("0");
  const [start, setStart] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listEmployees({ page_size: 100 })
      .then((p) => setEmployees(p.items))
      .catch(() => setEmployees([]));
  }, [open]);

  // A rough EMI so the amount is visible before saving.
  const preview = (() => {
    const p = Number(principal);
    const n = Number(instalments);
    const r = Number(rate);
    if (!p || !n) return null;
    if (method === "flat" && r > 0) return (p + (p * r * n) / 1200) / n;
    if (method === "reducing" && r > 0) {
      const i = r / 1200;
      const f = Math.pow(1 + i, n);
      return (p * i * f) / (f - 1);
    }
    return p / n;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !principal || !start) {
      toast.error("Employee, amount and first instalment month are required");
      return;
    }
    setSaving(true);
    try {
      await createLoan({
        employee_id: Number(employeeId),
        kind: "loan",
        principal,
        instalments: Number(instalments),
        interest_method: method,
        interest_rate: method === "none" ? "0" : rate,
        start_period: `${start}-01`,
        purpose: purpose.trim() || null,
      });
      toast.success("Created — the EMI will be recovered through payroll");
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New loan</DialogTitle>
          <DialogDescription>
            A larger amount recovered over instalments. For paying part of this
            month&apos;s salary early, use Salary advances instead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Employee *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.full_name} · {e.employee_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">First deduction *</Label>
              <Input
                type="month"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Amount *</Label>
              <Input
                type="number"
                min={1}
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Instalments *</Label>
              <Input
                type="number"
                min={1}
                max={240}
                value={instalments}
                onChange={(e) => setInstalments(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Interest</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTEREST_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {INTEREST_METHODS.find((m) => m.value === method)?.hint}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Annual rate %</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                disabled={method === "none"}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Purpose</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Medical, education…"
            />
          </div>

          {preview !== null && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              About{" "}
              <span className="font-semibold">
                {rupees(preview.toFixed(2), 0)}
              </span>{" "}
              a month for {instalments} months.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <HandCoins className="size-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
