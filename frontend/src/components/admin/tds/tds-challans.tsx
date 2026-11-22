"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Landmark,
  Download,
  Loader2,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Badge } from "@/components/ui/badge";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ApiError,
  createChallan,
  currentFy,
  deleteChallan,
  fyLabel,
  downloadForm138,
  getReconciliation,
  listChallans,
  listDeductees,
  monthName,
  tdsStatus,
  type TdsChallan,
  type TdsDeductee,
  type TdsReconciliation,
} from "@/lib/tds";
import { rupees } from "@/lib/payroll";
import { cn } from "@/lib/utils";

const TH = "h-9 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";
const NUM = `${TD} text-right tabular-nums`;

export function TdsChallans() {
  const [fy, setFy] = useState<number>(() => currentFy());
  const [quarter, setQuarter] = useState("all");

  const [challans, setChallans] = useState<TdsChallan[] | null>(null);
  const [recon, setRecon] = useState<TdsReconciliation | null>(null);
  const [building, setBuilding] = useState(false);
  const [deductees, setDeductees] = useState<TdsDeductee[]>([]);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const q = quarter === "all" ? undefined : Number(quarter);

  useEffect(() => {
    let alive = true;
    listChallans({ financial_year: fy, quarter: q })
      .then((d) => alive && setChallans(d))
      .catch(() => alive && setChallans([]));
    getReconciliation({ financial_year: fy, quarter: q })
      .then((d) => alive && setRecon(d))
      .catch(() => alive && setRecon(null));
    listDeductees({ financial_year: fy, quarter: q })
      .then((d) => alive && setDeductees(d))
      .catch(() => alive && setDeductees([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, quarter, reloadKey]);

  async function remove(row: TdsChallan) {
    if (!window.confirm(`Delete challan ${row.cin}?`)) return;
    try {
      await deleteChallan(row.id);
      setReloadKey((k) => k + 1);
      toast.success("Challan deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  const years = [currentFy() + 1, currentFy(), currentFy() - 1, currentFy() - 2];

  return (
    <div className="space-y-5">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(fy)} onValueChange={(v) => setFy(Number(v))}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                FY {fyLabel(y)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={quarter} onValueChange={setQuarter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Whole year</SelectItem>
            <SelectItem value="1">Q1 · Apr–Jun</SelectItem>
            <SelectItem value="2">Q2 · Jul–Sep</SelectItem>
            <SelectItem value="3">Q3 · Oct–Dec</SelectItem>
            <SelectItem value="4">Q4 · Jan–Mar</SelectItem>
          </SelectContent>
        </Select>

        {recon?.return_due_date && (
          <Badge variant="outline" className="h-8 gap-1.5 px-3 text-[11px]">
            Return due {recon.return_due_date}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={quarter === "all" || building}
            title={
              quarter === "all"
                ? "Pick a quarter — the return is filed one quarter at a time"
                : undefined
            }
            onClick={async () => {
              setBuilding(true);
              try {
                await downloadForm138(fy, Number(quarter));
              } catch (err) {
                toast.error(
                  err instanceof ApiError ? err.message : "Could not build it",
                );
              } finally {
                setBuilding(false);
              }
            }}
          >
            {building ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Form 138
          </Button>

          <Button size="sm" className="h-8" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" />
            Record challan
          </Button>
        </div>
      </div>

      {/* totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Deducted" value={recon?.total_deducted} />
        <Tile label="Deposited" value={recon?.total_deposited} />
        <Tile
          label="Difference"
          value={recon?.difference}
          tone={
            recon && Number(recon.difference) < 0
              ? "text-destructive"
              : recon && Number(recon.difference) > 0
                ? "text-sky-700"
                : undefined
          }
        />
        <Tile label="Deductees" value={String(deductees.length)} plain />
      </div>

      {/* reconciliation */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <header className="border-b border-border/60 px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.06em]">
            Deducted vs deposited
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Deducted is the TDS line on payslips. Deposited is what the
            challans add up to.
          </p>
        </header>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} pl-4`}>Month</TableHead>
                <TableHead className={`${TH} text-right`}>Deducted</TableHead>
                <TableHead className={`${TH} text-right`}>Deposited</TableHead>
                <TableHead className={`${TH} text-right`}>Difference</TableHead>
                <TableHead className={`${TH} hidden text-right sm:table-cell`}>
                  Staff
                </TableHead>
                <TableHead className={`${TH} hidden sm:table-cell`}>
                  Due by
                </TableHead>
                <TableHead className={`${TH} pr-4`}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!recon &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7} className="pl-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {recon?.months.map((m) => {
                const s = tdsStatus(m.status);
                const diff = Number(m.difference);
                return (
                  <TableRow key={m.period}>
                    <TableCell className={`${TD} pl-4 font-semibold`}>
                      {monthName(m.period)}
                    </TableCell>
                    <TableCell className={NUM}>{rupees(m.deducted, 0)}</TableCell>
                    <TableCell className={NUM}>{rupees(m.deposited, 0)}</TableCell>
                    <TableCell
                      className={cn(
                        NUM,
                        diff < 0 && "font-semibold text-destructive",
                        diff > 0 && "text-sky-700",
                      )}
                    >
                      {diff === 0 ? "—" : rupees(m.difference, 0)}
                    </TableCell>
                    <TableCell className={`${NUM} hidden sm:table-cell`}>
                      {m.employees || "—"}
                    </TableCell>
                    <TableCell
                      className={`${TD} hidden whitespace-nowrap sm:table-cell`}
                    >
                      {m.due_date}
                      {m.is_late && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1 inline-flex align-middle text-amber-600">
                              <AlertTriangle className="size-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            Deposited after the due date — interest may apply
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell className={`${TD} pr-4`}>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                          s.tone,
                        )}
                      >
                        {s.label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* challans */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <header className="border-b border-border/60 px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.06em]">
            Challans
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            CIN is the BSR code, deposit date and serial combined.
          </p>
        </header>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} pl-4`}>Month</TableHead>
                <TableHead className={TH}>CIN</TableHead>
                <TableHead className={`${TH} hidden md:table-cell`}>
                  Deposited
                </TableHead>
                <TableHead className={`${TH} text-right`}>TDS</TableHead>
                <TableHead className={`${TH} hidden text-right lg:table-cell`}>
                  Interest
                </TableHead>
                <TableHead className={`${TH} hidden text-right lg:table-cell`}>
                  Late fee
                </TableHead>
                <TableHead className={`${TH} text-right`}>Total</TableHead>
                <TableHead className={`${TH} w-9 pr-4`} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {challans === null &&
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8} className="pl-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {challans?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Receipt className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">No challans recorded</p>
                      <p className="text-xs text-muted-foreground">
                        Record each TDS deposit so the quarterly return can be
                        reconciled.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {challans?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className={`${TD} pl-4 font-semibold`}>
                    {monthName(c.period)}
                  </TableCell>
                  <TableCell className={`${TD} font-mono text-[11px]`}>
                    {c.cin}
                  </TableCell>
                  <TableCell className={`${TD} hidden whitespace-nowrap md:table-cell`}>
                    {c.deposit_date}
                    {c.is_late && (
                      <Badge
                        variant="outline"
                        className="ml-1.5 border-amber-500/40 text-[10px] text-amber-700"
                      >
                        Late
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={NUM}>{rupees(c.tds_amount, 0)}</TableCell>
                  <TableCell className={`${NUM} hidden lg:table-cell`}>
                    {Number(c.interest) ? rupees(c.interest, 0) : "—"}
                  </TableCell>
                  <TableCell className={`${NUM} hidden lg:table-cell`}>
                    {Number(c.late_fee) ? rupees(c.late_fee, 0) : "—"}
                  </TableCell>
                  <TableCell className={`${NUM} font-semibold`}>
                    {rupees(c.total_amount, 0)}
                  </TableCell>
                  <TableCell className={`${TD} pr-4`}>
                    <IconButton
                      label="Delete challan"
                      icon={Trash2}
                      variant="destructive"
                      size="sm"
                      onClick={() => remove(c)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* deductees */}
      {deductees.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.06em]">
              Deductees
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Per-employee TDS for the period. A missing PAN blocks the return.
            </p>
          </header>
          <ul className="divide-y divide-border/60">
            {deductees.map((d) => (
              <li
                key={d.employee_id}
                className="flex items-center gap-3 px-4 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">
                    {d.employee_name}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {d.employee_code} ·{" "}
                    {d.pan ? (
                      `PAN ${d.pan}`
                    ) : (
                      <span className="text-destructive">PAN missing</span>
                    )}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {d.months} month{d.months === 1 ? "" : "s"}
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {rupees(d.amount, 0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ChallanDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          setReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  plain,
}: {
  label: string;
  value: string | undefined;
  tone?: string;
  plain?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-1.5 h-6 w-20" />
      ) : (
        <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone)}>
          {plain ? value : rupees(value, 0)}
        </p>
      )}
    </div>
  );
}

function ChallanDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [period, setPeriod] = useState("");
  const [depositDate, setDepositDate] = useState("");
  const [bsr, setBsr] = useState("");
  const [serial, setSerial] = useState("");
  const [tds, setTds] = useState("");
  const [interest, setInterest] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [mode, setMode] = useState("online");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!period || !depositDate || !bsr || !serial) {
      toast.error("Month, deposit date, BSR code and serial are required");
      return;
    }
    setSaving(true);
    try {
      await createChallan({
        period: `${period}-01`,
        deposit_date: depositDate,
        bsr_code: bsr.trim(),
        challan_serial: serial.trim(),
        tds_amount: tds || "0",
        interest: interest || "0",
        late_fee: lateFee || "0",
        mode: mode as TdsChallan["mode"],
        note: note.trim() || null,
      });
      toast.success("Challan recorded");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a TDS challan</DialogTitle>
          <DialogDescription>
            One entry per deposit. TDS is due by the 7th of the following month
            (30 April for March).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Deduction month *</Label>
              <Input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Deposit date *</Label>
              <Input
                type="date"
                value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">BSR code *</Label>
              <Input
                value={bsr}
                onChange={(e) => setBsr(e.target.value.replace(/\D/g, ""))}
                maxLength={7}
                placeholder="0510308"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                7 digits, from the bank.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Challan serial *</Label>
              <Input
                value={serial}
                onChange={(e) => setSerial(e.target.value.replace(/\D/g, ""))}
                maxLength={5}
                placeholder="04321"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">TDS amount *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={tds}
                onChange={(e) => setTds(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Interest</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Late fee</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Landmark className="size-4" />
              )}
              Record challan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
