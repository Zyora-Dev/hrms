"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  CalendarPlus,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Gift,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollInputsDialog } from "./payroll-inputs";
import { PayslipDialog } from "./payslip-dialog";
import {
  ApiError,
  PAYSLIP_TEMPLATES,
  computeRun,
  createRun,
  deleteRun,
  downloadPayslip,
  downloadReport,
  getRun,
  listPayslips,
  listRunsFiltered,
  monthLabel,
  rupees,
  setRunStatus,
  type PayrollRun,
  type PayrollRunDetail,
  type Payslip,
  type PayslipFilters,
} from "@/lib/payroll";
import { listLookups, type Lookup } from "@/lib/lookups";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// The payroll tables are dense, numeric and scanned column-by-column, so they
// run a step smaller than the rest of the admin area.
const TH = "h-9 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";
const NUM = `${TD} text-right tabular-nums`;

const STATUS_TONES: Record<string, string> = {
  draft: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  approved: "bg-primary/15 text-primary ring-primary/25",
  paid: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25",
};

export function PayrollRuns() {
  const [runs, setRuns] = useState<PayrollRun[] | null>(null);
  const [detail, setDetail] = useState<PayrollRunDetail | null>(null);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPeriod, setNewPeriod] = useState("");
  const [busy, setBusy] = useState(false);

  // Run-level filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [runStatus, setRunStatus_] = useState("all");

  // Payslip-level filters
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [onlyLop, setOnlyLop] = useState(false);
  const [onlyOt, setOnlyOt] = useState(false);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [template, setTemplate] = useState<string>("classic");
  const [inputsOpen, setInputsOpen] = useState(false);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slipFilters: PayslipFilters = {
    q: search || undefined,
    department_id: departmentId === "all" ? undefined : Number(departmentId),
    only_lop: onlyLop,
    only_overtime: onlyOt,
  };

  useEffect(() => {
    listLookups("departments").then(setDepartments).catch(() => setDepartments([]));
  }, []);

  // Only arm the timer for a real change, otherwise the mount tick fires with
  // nothing to fetch.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === search) return;
    debounce.current = setTimeout(() => setSearch(trimmed), 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, search]);

  useEffect(() => {
    listRunsFiltered({
      date_from: from || undefined,
      date_to: to || undefined,
      status: runStatus,
    })
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [from, to, runStatus]);

  // Re-filter the open run's payslips server-side.
  useEffect(() => {
    if (!detail) return;
    let alive = true;
    listPayslips(detail.id, slipFilters)
      .then((rows) => alive && setSlips(rows))
      .catch(() => alive && setSlips([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, search, departmentId, onlyLop, onlyOt]);

  async function refreshRuns() {
    setRuns(
      await listRunsFiltered({
        date_from: from || undefined,
        date_to: to || undefined,
        status: runStatus,
      }).catch(() => []),
    );
  }

  async function onCreate() {
    if (!newPeriod) {
      toast.error("Pick a month");
      return;
    }
    setBusy(true);
    try {
      const run = await createRun(`${newPeriod}-01`);
      toast.success(`${monthLabel(run.period)} calculated`);
      setCreating(false);
      setDetail(run);
      setSlips(await listPayslips(run.id, slipFilters));
      await refreshRuns();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create run");
    } finally {
      setBusy(false);
    }
  }

  async function onOpen(run: PayrollRun) {
    setBusy(true);
    try {
      const full = await getRun(run.id);
      setDetail(full);
      setSlips(await listPayslips(full.id, slipFilters));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open run");
    } finally {
      setBusy(false);
    }
  }

  async function onRecompute(run: PayrollRun) {
    setBusy(true);
    try {
      const fresh = await computeRun(run.id);
      setDetail(fresh);
      setSlips(await listPayslips(fresh.id, slipFilters));
      await refreshRuns();
      toast.success("Recalculated with the current settings");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not recompute");
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(run: PayrollRun, status: string) {
    try {
      await setRunStatus(run.id, status);
      await refreshRuns();
      if (detail?.id === run.id) setDetail(await getRun(run.id));
      toast.success(`Marked ${status}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    }
  }

  async function onExport(format: "csv" | "pdf") {
    if (!detail) return;
    setBusy(true);
    try {
      await downloadReport(detail.id, format, slipFilters);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPayslipPdf(s: Payslip) {
    if (!detail) return;
    try {
      await downloadPayslip(detail.id, s.employee_id, template);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not build payslip");
    }
  }

  async function onDelete(run: PayrollRun) {
    if (!window.confirm(`Delete the ${monthLabel(run.period)} run?`)) return;
    try {
      await deleteRun(run.id);
      if (detail?.id === run.id) {
        setDetail(null);
        setSlips([]);
      }
      await refreshRuns();
      toast.success("Run deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-8 w-[140px] text-xs"
          aria-label="Period from"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="month"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-8 w-[140px] text-xs"
          aria-label="Period to"
        />
        <Select value={runStatus} onValueChange={setRunStatus_}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>

        {(from || to || runStatus !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setFrom("");
              setTo("");
              setRunStatus_("all");
            }}
          >
            Clear
          </Button>
        )}

        <p className="ml-auto text-xs text-muted-foreground">
          {runs === null
            ? "Loading…"
            : `${runs.length} run${runs.length === 1 ? "" : "s"}`}
        </p>
        <Button
          size="sm"
          className="h-8"
          onClick={() => {
            const d = new Date();
            setNewPeriod(
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
            );
            setCreating(true);
          }}
        >
          <CalendarPlus className="size-4" />
          Run payroll
        </Button>
      </div>

      {runs === null ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Wallet className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">No payroll runs yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A run pulls attendance for the month and applies your salary
              structure and policy.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={`${TH} pl-4`}>Period</TableHead>
                  <TableHead className={`${TH} text-right`}>Staff</TableHead>
                  <TableHead className={`${TH} hidden text-right sm:table-cell`}>
                    Gross
                  </TableHead>
                  <TableHead className={`${TH} hidden text-right sm:table-cell`}>
                    Deductions
                  </TableHead>
                  <TableHead className={`${TH} text-right`}>Net</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={`${TH} w-[132px] pr-4 text-right`}>
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className={`${TD} pl-4 font-semibold`}>
                      {monthLabel(run.period)}
                    </TableCell>
                    <TableCell className={NUM}>{run.employee_count}</TableCell>
                    <TableCell className={`${NUM} hidden sm:table-cell`}>
                      {rupees(run.total_gross, 0)}
                    </TableCell>
                    <TableCell className={`${NUM} hidden text-destructive sm:table-cell`}>
                      {rupees(run.total_deductions, 0)}
                    </TableCell>
                    <TableCell className={`${NUM} font-semibold`}>
                      {rupees(run.total_net, 0)}
                    </TableCell>
                    <TableCell className={TD}>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
                          STATUS_TONES[run.status],
                        )}
                      >
                        {run.status}
                      </span>
                    </TableCell>
                    <TableCell className={`${TD} pr-4`}>
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          label="View payslips"
                          icon={Eye}
                          variant="brand"
                          size="sm"
                          disabled={busy}
                          onClick={() => onOpen(run)}
                        />
                        {run.status === "draft" && (
                          <IconButton
                            label="Recalculate"
                            icon={busy ? Loader2 : RefreshCw}
                            variant="neutral"
                            size="sm"
                            disabled={busy}
                            onClick={() => onRecompute(run)}
                            className={busy ? "[&_svg]:animate-spin" : undefined}
                          />
                        )}
                        {run.status === "draft" && (
                          <IconButton
                            label="Approve"
                            icon={CheckCircle2}
                            variant="neutral"
                            size="sm"
                            onClick={() => onStatus(run, "approved")}
                          />
                        )}
                        {run.status === "approved" && (
                          <IconButton
                            label="Mark paid"
                            icon={Wallet}
                            variant="neutral"
                            size="sm"
                            onClick={() => onStatus(run, "paid")}
                          />
                        )}
                        {run.status !== "paid" && (
                          <IconButton
                            label="Delete run"
                            icon={Trash2}
                            variant="destructive"
                            size="sm"
                            onClick={() => onDelete(run)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* payslips for the open run */}
      {detail && (
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <header className="space-y-2.5 border-b border-border/60 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.06em]">
                  Payslips · {monthLabel(detail.period)}
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {slips.length} of {detail.payslips.length} employee
                  {detail.payslips.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[11px] capitalize">
                  {detail.status}
                </Badge>

                <Select value={template} onValueChange={setTemplate}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYSLIP_TEMPLATES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label} payslip
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setInputsOpen(true)}
                >
                  <Gift className="size-3.5" />
                  Inputs
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={busy}
                  onClick={() => onExport("csv")}
                >
                  <FileSpreadsheet className="size-3.5" />
                  CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={busy}
                  onClick={() => onExport("pdf")}
                >
                  <FileText className="size-3.5" />
                  PDF
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Employee name or code"
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                variant={onlyLop ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setOnlyLop((v) => !v)}
              >
                Has LOP
              </Button>
              <Button
                size="sm"
                variant={onlyOt ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setOnlyOt((v) => !v)}
              >
                <ArrowRightLeft className="size-3.5" />
                Has overtime
              </Button>

              {(search || departmentId !== "all" || onlyLop || onlyOt) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setQuery("");
                    setSearch("");
                    setDepartmentId("all");
                    setOnlyLop(false);
                    setOnlyOt(false);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </header>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={`${TH} pl-4`}>Employee</TableHead>
                  <TableHead className={`${TH} hidden text-right md:table-cell`}>
                    Payable
                  </TableHead>
                  <TableHead className={`${TH} hidden text-right lg:table-cell`}>
                    LOP
                  </TableHead>
                  <TableHead className={`${TH} text-right`}>Gross</TableHead>
                  <TableHead className={`${TH} hidden text-right sm:table-cell`}>
                    Deductions
                  </TableHead>
                  <TableHead className={`${TH} text-right`}>Net</TableHead>
                  <TableHead className={`${TH} w-[76px] pr-4`} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {slips.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => setSlip(s)}
                  >
                    <TableCell className={`${TD} pl-4`}>
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-semibold">
                          {s.employee_name}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {s.employee_code}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className={`${NUM} hidden md:table-cell`}>
                      {s.payable_days} / {s.period_days}
                    </TableCell>
                    <TableCell className={`${NUM} hidden lg:table-cell`}>
                      {Number(s.lop_days) > 0 ? (
                        <span className="text-destructive">{s.lop_days}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell className={NUM}>{rupees(s.gross_pay, 0)}</TableCell>
                    <TableCell className={`${NUM} hidden text-destructive sm:table-cell`}>
                      {rupees(s.total_deductions, 0)}
                    </TableCell>
                    <TableCell className={`${NUM} font-semibold`}>
                      {rupees(s.net_pay, 0)}
                    </TableCell>
                    <TableCell
                      className={`${TD} pr-4`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          label="View payslip"
                          icon={Eye}
                          variant="neutral"
                          size="sm"
                          onClick={() => setSlip(s)}
                        />
                        <IconButton
                          label={`Download ${template} payslip`}
                          icon={Download}
                          variant="brand"
                          size="sm"
                          onClick={() => onPayslipPdf(s)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run payroll</DialogTitle>
            <DialogDescription>
              Pulls attendance for the month and applies your salary structure,
              leave policy and statutory settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Month</Label>
            <Input
              type="month"
              value={newPeriod}
              onChange={(e) => setNewPeriod(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarPlus className="size-4" />
              )}
              Calculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detail && (
        <PayrollInputsDialog
          open={inputsOpen}
          period={detail.period}
          locked={detail.status !== "draft"}
          onClose={() => setInputsOpen(false)}
          onChanged={() => {}}
        />
      )}

      <PayslipDialog
        slip={slip}
        period={detail?.period ?? ""}
        runId={detail?.id}
        defaultTemplate={template}
        onClose={() => setSlip(null)}
      />
    </div>
  );
}
