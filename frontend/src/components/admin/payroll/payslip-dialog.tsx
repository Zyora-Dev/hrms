"use client";

import { useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ApiError,
  PAYSLIP_TEMPLATES,
  downloadPayslip,
  monthLabel,
  previewPayslip,
  rupees,
  type Payslip,
} from "@/lib/payroll";
import { cn } from "@/lib/utils";

function hours(minutes: number) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function PayslipDialog({
  slip,
  period,
  runId,
  defaultTemplate = "classic",
  onClose,
}: {
  slip: Payslip | null;
  period: string;
  runId?: number;
  defaultTemplate?: string;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState(defaultTemplate);
  const [busy, setBusy] = useState(false);

  if (!slip) return null;

  async function run(action: "open" | "save") {
    if (!runId || !slip) return;
    setBusy(true);
    try {
      if (action === "open") {
        await previewPayslip(runId, slip.employee_id, template);
      } else {
        await downloadPayslip(runId, slip.employee_id, template);
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not build the payslip",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!slip} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/60 p-5">
          <DialogTitle>{slip.employee_name}</DialogTitle>
          <DialogDescription>
            {slip.employee_code}
            {slip.designation ? ` · ${slip.designation}` : ""} ·{" "}
            {monthLabel(period)}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[66vh] space-y-5 overflow-y-auto p-5">
          {/* attendance basis */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Payable days" value={`${slip.payable_days} / ${slip.period_days}`} />
            <Stat
              label="Loss of pay"
              value={`${slip.lop_days} day${Number(slip.lop_days) === 1 ? "" : "s"}`}
              tone={Number(slip.lop_days) > 0 ? "text-destructive" : undefined}
            />
            <Stat label="Hours worked" value={hours(slip.worked_minutes)} />
            <Stat
              label="Overtime"
              value={hours(slip.overtime_minutes)}
              tone={slip.overtime_minutes > 0 ? "text-brand-ink" : undefined}
            />
          </div>

          <LineGroup title="Earnings" lines={slip.earnings} total={slip.gross_pay} />
          <LineGroup
            title="Deductions"
            lines={slip.deductions}
            total={slip.total_deductions}
            negative
          />

          {slip.leave.length > 0 && (
            <section className="rounded-xl border border-border/60">
              <h3 className="border-b border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Leave this period
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
                    <th className="px-3 py-1.5 text-left font-semibold">Type</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Open</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Accrued</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Used</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Encashed</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Lapsed</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Carried</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {slip.leave.map((l) => (
                    <tr key={l.code} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-1.5 font-semibold">{l.name}</td>
                      <td className="px-2 py-1.5 text-right">{l.opening}</td>
                      <td className="px-2 py-1.5 text-right">{l.accrued}</td>
                      <td className="px-2 py-1.5 text-right">{l.used}</td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right",
                          Number(l.encashed) > 0 && "font-semibold text-brand-ink",
                        )}
                      >
                        {l.encashed}
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {l.lapsed}
                      </td>
                      <td className="px-3 py-1.5 text-right">{l.closing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {slip.employer_contributions.length > 0 && (
            <section className="rounded-xl border border-dashed border-border px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Employer contributions (not deducted)
              </p>
              <ul className="mt-1.5 space-y-1">
                {slip.employer_contributions.map((l) => (
                  <li key={l.code} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{l.name}</span>
                    <span className="font-semibold tabular-nums">
                      {rupees(l.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex items-center justify-between rounded-xl bg-brand-ink px-4 py-3 text-white">
            <span className="text-xs font-medium uppercase tracking-[0.06em]">
              Net pay
            </span>
            <span className="text-xl font-semibold tabular-nums tracking-tight">
              {rupees(slip.net_pay)}
            </span>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 border-t border-border/60 p-4">
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="mr-auto h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYSLIP_TEMPLATES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !runId}
            onClick={() => run("open")}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ExternalLink className="size-3.5" />
            )}
            Preview PDF
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !runId}
            onClick={() => run("save")}
          >
            <Download className="size-3.5" />
            Download
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
    <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-xs font-semibold", tone)}>{value}</p>
    </div>
  );
}

function LineGroup({
  title,
  lines,
  total,
  negative,
}: {
  title: string;
  lines: { code: string; name: string; amount: string; note: string | null }[];
  total: string;
  negative?: boolean;
}) {
  if (lines.length === 0) {
    return (
      <section className="rounded-xl border border-border/60 px-3 py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Nothing to show — no salary is on file for this employee.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/60">
      <h3 className="border-b border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      <ul>
        {lines.map((l) => (
          <li
            key={l.code}
            className="flex items-start justify-between gap-4 border-b border-border/40 px-3 py-1.5 last:border-0"
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium">{l.name}</span>
              {l.note && (
                <span className="block text-[11px] text-muted-foreground">
                  {l.note}
                </span>
              )}
            </span>
            <span
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                negative && "text-destructive",
              )}
            >
              {negative ? "−" : ""}
              {rupees(l.amount)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
        <span className="text-xs font-semibold">Total {title.toLowerCase()}</span>
        <span className="text-xs font-semibold tabular-nums">{rupees(total)}</span>
      </div>
    </section>
  );
}
