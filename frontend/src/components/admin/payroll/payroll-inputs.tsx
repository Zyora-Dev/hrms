"use client";

import { useEffect, useState } from "react";
import { Gift, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  INPUT_KINDS,
  createInput,
  deleteInput,
  inputSide,
  listInputs,
  monthLabel,
  rupees,
  type PayrollInput,
} from "@/lib/payroll";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";
import { cn } from "@/lib/utils";

export function PayrollInputsDialog({
  open,
  period,
  locked,
  onClose,
  onChanged,
}: {
  open: boolean;
  period: string;
  locked: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<PayrollInput[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState("");
  const [kind, setKind] = useState<string>("bonus");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");
  const [refPeriod, setRefPeriod] = useState("");
  const [days, setDays] = useState("");
  const [inPf, setInPf] = useState(false);
  const [inEsi, setInEsi] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listEmployees({ page_size: 100 })
      .then((p) => setEmployees(p.items))
      .catch(() => setEmployees([]));
    listInputs({ period })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, period]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !label.trim()) {
      toast.error("Employee and label are required");
      return;
    }
    setSaving(true);
    try {
      const created = await createInput({
        employee_id: Number(employeeId),
        period,
        kind: kind as PayrollInput["kind"],
        label: label.trim(),
        amount: amount || "0",
        hours: kind === "overtime" && hours ? hours : null,
        reference_period:
          kind === "lop_reversal" && refPeriod ? `${refPeriod}-01` : null,
        days: kind === "lop_reversal" && days ? days : null,
        include_in_pf: inPf,
        include_in_esi: inEsi,
      });
      setRows((r) => [created, ...r]);
      setLabel("");
      setAmount("");
      setHours("");
      onChanged();
      toast.success("Added — recalculate the run to apply it");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: PayrollInput) {
    try {
      await deleteInput(row.id);
      setRows((r) => r.filter((x) => x.id !== row.id));
      onChanged();
      toast.success("Removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove");
    }
  }

  const isOvertime = kind === "overtime";
  const isReversal = kind === "lop_reversal";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/60 p-5">
          <DialogTitle>Payroll inputs · {monthLabel(period)}</DialogTitle>
          <DialogDescription>
            One-off bonus, incentive, deduction or extra overtime for this month
            only. The salary structure covers the recurring part.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] space-y-4 overflow-y-auto p-5">
          {locked ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800">
              This run is no longer a draft, so inputs are locked. Move it back
              to draft to make changes.
            </p>
          ) : (
            <form
              onSubmit={add}
              className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Employee</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger className="h-8 w-full text-xs">
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
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Type</Label>
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INPUT_KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                          <span className="ml-1 text-muted-foreground">
                            ({k.side})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[11px] font-semibold">
                    Label (shown on the payslip)
                  </Label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Diwali bonus"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">
                    {isOvertime ? "Hours" : isReversal ? "LOP days" : "Amount"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={isOvertime ? hours : isReversal ? days : amount}
                    onChange={(e) =>
                      isOvertime
                        ? setHours(e.target.value)
                        : isReversal
                          ? setDays(e.target.value)
                          : setAmount(e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {isReversal && (
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">
                    Reverse LOP from
                  </Label>
                  <Input
                    type="month"
                    value={refPeriod}
                    onChange={(e) => setRefPeriod(e.target.value)}
                    className="h-8 text-xs sm:w-[200px]"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Priced at that month&apos;s rate, not this one&apos;s, so a
                    salary change in between cannot distort it.
                  </p>
                </div>
              )}

              {isOvertime && (
                <p className="text-[11px] text-muted-foreground">
                  Priced at the overtime rate in Settings and added to whatever
                  attendance already recorded.
                </p>
              )}

              {inputSide(kind) === "earning" && !isOvertime && !isReversal && (
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium">
                    <Switch checked={inPf} onCheckedChange={setInPf} />
                    Counts for PF
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium">
                    <Switch checked={inEsi} onCheckedChange={setInEsi} />
                    Counts for ESI
                  </label>
                </div>
              )}

              <Button type="submit" size="sm" className="h-8" disabled={saving}>
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Add input
              </Button>
            </form>
          )}

          {loading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Gift className="size-4" />
              </span>
              <p className="text-sm font-semibold">No inputs this month</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border">
              {rows.map((r) => {
                const deduction = inputSide(r.kind) === "deduction";
                return (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">
                        {r.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {r.employee_name} · {r.employee_code} · {r.kind}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        deduction ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {r.hours
                        ? `${r.hours} h`
                        : `${deduction ? "−" : ""}${rupees(r.amount, 0)}`}
                      {r.days && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          {r.days}d
                        </span>
                      )}
                    </span>
                    {!locked && (
                      <IconButton
                        label="Remove input"
                        icon={Trash2}
                        variant="destructive"
                        size="sm"
                        onClick={() => remove(r)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
