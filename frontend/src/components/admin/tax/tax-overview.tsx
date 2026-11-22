"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Loader2,
  Percent,
  Receipt,
  Save,
  Scale,
} from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
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
  compareRegimes,
  computeAll,
  listDeclarations,
  listSections,
  saveDeclaration,
  type DeductionSection,
  type RegimeComparison,
  type TaxComputation,
  type TaxDeclaration,
} from "@/lib/tax";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";
import { rupees } from "@/lib/payroll";
import { currentFy, fyLabel } from "@/lib/tds";
import { cn } from "@/lib/utils";

const TH = "h-9 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";
const NUM = `${TD} text-right tabular-nums`;

export function TaxOverview() {
  const [fy, setFy] = useState(() => currentFy());
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [rows, setRows] = useState<TaxComputation[] | null>(null);
  const [declarations, setDeclarations] = useState<TaxDeclaration[]>([]);
  const [sections, setSections] = useState<DeductionSection[]>([]);
  const [editing, setEditing] = useState<EmployeeListItem | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    listSections().then(setSections).catch(() => setSections([]));
  }, []);

  useEffect(() => {
    let alive = true;

    listEmployees({ page_size: 100 })
      .then((page) => alive && setEmployees(page.items))
      .catch(() => {});

    computeAll(fy)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));

    listDeclarations(fy)
      .then((d) => alive && setDeclarations(d))
      .catch(() => alive && setDeclarations([]));

    return () => {
      alive = false;
    };
  }, [fy, reloadKey]);

  const years = [currentFy(), currentFy() - 1, currentFy() + 1];
  const totalAnnual = (rows ?? []).reduce((a, r) => a + Number(r.annual_tax), 0);
  const totalMonthly = (rows ?? []).reduce((a, r) => a + Number(r.monthly_tds), 0);

  return (
    <div className="space-y-5">
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
        <p className="text-xs text-muted-foreground">
          Projected from salary paid so far plus the months still to come.
        </p>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">
            Annual{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {rupees(totalAnnual, 0)}
            </span>
          </span>
          <span className="text-muted-foreground">
            This month{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {rupees(totalMonthly, 0)}
            </span>
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} pl-4`}>Employee</TableHead>
                <TableHead className={TH}>Regime</TableHead>
                <TableHead className={`${TH} hidden text-right lg:table-cell`}>
                  Annual gross
                </TableHead>
                <TableHead className={`${TH} text-right`}>Taxable</TableHead>
                <TableHead className={`${TH} text-right`}>Annual tax</TableHead>
                <TableHead className={`${TH} hidden text-right sm:table-cell`}>
                  Deducted
                </TableHead>
                <TableHead className={`${TH} text-right`}>Monthly TDS</TableHead>
                <TableHead className={`${TH} w-[120px] pr-4 text-right`} />
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
                        <Receipt className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">Nothing to compute</p>
                      <p className="text-xs text-muted-foreground">
                        Check a regime exists for this year in Settings.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {rows?.map((r) => {
                const declared = declarations.find(
                  (d) => d.employee_id === r.employee_id,
                );
                const employee = employees.find((e) => e.id === r.employee_id);
                return (
                  <TableRow key={r.employee_id}>
                    <TableCell className={`${TD} pl-4`}>
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-semibold">
                          {r.employee_name}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {r.employee_code}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className={TD}>
                      <span className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {r.regime_code}
                        </Badge>
                        {declared?.verified && (
                          <span className="text-[10px] text-primary">verified</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className={`${NUM} hidden lg:table-cell`}>
                      {rupees(r.gross_salary, 0)}
                    </TableCell>
                    <TableCell className={NUM}>
                      {rupees(r.taxable_income, 0)}
                    </TableCell>
                    <TableCell className={`${NUM} font-semibold`}>
                      {rupees(r.annual_tax, 0)}
                    </TableCell>
                    <TableCell className={`${NUM} hidden sm:table-cell`}>
                      {rupees(r.already_deducted, 0)}
                    </TableCell>
                    <TableCell className={`${NUM} font-semibold text-brand-ink`}>
                      {rupees(r.monthly_tds, 0)}
                    </TableCell>
                    <TableCell className={`${TD} pr-4 text-right`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => employee && setEditing(employee)}
                      >
                        Declaration
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {editing && (
        <DeclarationDialog
          employee={editing}
          fy={fy}
          sections={sections}
          existing={declarations.find((d) => d.employee_id === editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function DeclarationDialog({
  employee,
  fy,
  sections,
  existing,
  onClose,
  onSaved,
}: {
  employee: EmployeeListItem;
  fy: number;
  sections: DeductionSection[];
  existing?: TaxDeclaration;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [regime, setRegime] = useState(existing?.regime_code ?? "new");
  const [rent, setRent] = useState(existing?.hra_rent_paid ?? "0");
  const [metro, setMetro] = useState(existing?.hra_metro ?? false);
  const [other, setOther] = useState(existing?.other_income ?? "0");
  const [verified, setVerified] = useState(existing?.verified ?? false);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (existing?.items ?? []).map((i) => [i.code, String(i.amount)]),
    ),
  );
  const [comparison, setComparison] = useState<RegimeComparison | null>(null);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState(false);

  async function onCompare() {
    setComparing(true);
    try {
      setComparison(await compareRegimes(employee.id, fy));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not compare");
    } finally {
      setComparing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveDeclaration(employee.id, {
        financial_year: fy,
        regime_code: regime,
        hra_rent_paid: rent || "0",
        hra_metro: metro,
        other_income: other || "0",
        verified,
        items: Object.entries(amounts)
          .filter(([, v]) => Number(v) > 0)
          .map(([code, amount]) => ({ code, amount })),
      });
      toast.success("Saved — recalculate payroll to apply");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const usable = sections.filter((s) =>
    regime === "old" ? s.allowed_in_old : s.allowed_in_new,
  );
  const ignored = sections.filter((s) =>
    regime === "old" ? !s.allowed_in_old : !s.allowed_in_new,
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle>{employee.full_name}</DialogTitle>
          <DialogDescription>
            Tax declaration for FY {fyLabel(fy)} · {employee.employee_code}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <div className="grid max-h-[62vh] overflow-y-auto md:grid-cols-[1fr_280px]">
            <div className="space-y-5 px-6 py-5">
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Regime
                </Label>
                <div className="mt-2 flex gap-1.5">
                  {(["new", "old"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRegime(r)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors",
                        regime === r
                          ? "border-brand-ink bg-brand-ink text-white"
                          : "border-border bg-card text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {r} regime
                    </button>
                  ))}
                </div>
              </div>

              {usable.length > 0 && (
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Deductions claimed
                  </Label>
                  <ul className="mt-2 space-y-2">
                    {usable.map((s) => (
                      <li key={s.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold">
                            {s.code}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {s.name}
                            {s.max_amount
                              ? ` · max ${rupees(s.max_amount, 0)}`
                              : ""}
                          </span>
                        </span>
                        <Input
                          type="number"
                          min={0}
                          value={amounts[s.code] ?? ""}
                          onChange={(e) =>
                            setAmounts((a) => ({ ...a, [s.code]: e.target.value }))
                          }
                          className="h-8 w-32 text-xs"
                          placeholder="0"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {ignored.length > 0 && (
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                  Not allowed in the {regime} regime and ignored even if entered:{" "}
                  <span className="font-medium">
                    {ignored.map((s) => s.code).join(", ")}
                  </span>
                </p>
              )}

              {regime === "old" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Annual rent paid</Label>
                    <Input
                      type="number"
                      min={0}
                      value={rent}
                      onChange={(e) => setRent(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                      <Switch checked={metro} onCheckedChange={setMetro} />
                      Metro city
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Other income</Label>
                    <Input
                      type="number"
                      min={0}
                      value={other}
                      onChange={(e) => setOther(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <Switch checked={verified} onCheckedChange={setVerified} />
                Proofs verified
              </label>
            </div>

            <aside className="border-t border-border/60 bg-muted/30 px-5 py-5 md:border-l md:border-t-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full text-xs"
                onClick={onCompare}
                disabled={comparing}
              >
                {comparing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowLeftRight className="size-3.5" />
                )}
                Compare regimes
              </Button>

              {comparison ? (
                <div className="mt-4 space-y-3">
                  {(["new_regime", "old_regime"] as const).map((key) => {
                    const c = comparison[key];
                    const best = comparison.better === c.regime_code;
                    return (
                      <div
                        key={key}
                        className={cn(
                          "rounded-lg border p-3",
                          best
                            ? "border-primary/40 bg-primary/10"
                            : "border-border bg-card",
                        )}
                      >
                        <p className="flex items-center justify-between text-xs font-semibold capitalize">
                          {c.regime_code} regime
                          {best && (
                            <span className="flex items-center gap-1 text-[10px] text-brand-ink">
                              <Scale className="size-3" />
                              better
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Taxable {rupees(c.taxable_income, 0)}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums">
                          {rupees(c.annual_tax, 0)}
                        </p>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-muted-foreground">
                    Saves {rupees(comparison.saving, 0)} a year.
                  </p>
                </div>
              ) : (
                <div className="mt-6 flex flex-col items-center gap-2 text-center">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Percent className="size-4" />
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Compare both regimes on this declaration before choosing.
                  </p>
                </div>
              )}
            </aside>
          </div>

          <DialogFooter className="border-t border-border/60 px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save declaration
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
