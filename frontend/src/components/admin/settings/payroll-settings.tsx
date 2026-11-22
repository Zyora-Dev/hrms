"use client";

import { useEffect, useState } from "react";
import {
  Award,
  Banknote,
  CalendarDays,
  Check,
  Landmark,
  Loader2,
  Plus,
  Save,
  Timer,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  COMPONENT_CALCS,
  LOP_BASES,
  createComponent,
  deleteComponent,
  getPayrollSettings,
  listComponents,
  savePayrollSettings,
  updateComponent,
  type PayrollSettings,
  type PayrollSettingsPayload,
  type SalaryComponent,
} from "@/lib/payroll";
import { cn } from "@/lib/utils";

function toPayload(s: PayrollSettings): PayrollSettingsPayload {
  return {
    lop_basis: s.lop_basis,
    standard_days_per_month: s.standard_days_per_month,
    round_net_to: s.round_net_to,
    pay_overtime: s.pay_overtime,
    overtime_rate_basis: s.overtime_rate_basis,
    overtime_multiplier: s.overtime_multiplier,
    leave_encashment_enabled: s.leave_encashment_enabled,
    encashment_basis: s.encashment_basis,
    pf_enabled: s.pf_enabled,
    pf_employee_percent: s.pf_employee_percent,
    pf_employer_percent: s.pf_employer_percent,
    pf_wage_ceiling: s.pf_wage_ceiling,
    pf_cap_at_ceiling: s.pf_cap_at_ceiling,
    esi_enabled: s.esi_enabled,
    esi_employee_percent: s.esi_employee_percent,
    esi_employer_percent: s.esi_employer_percent,
    esi_gross_ceiling: s.esi_gross_ceiling,
    pt_enabled: s.pt_enabled,
    pt_amount: s.pt_amount,
    tds_enabled: s.tds_enabled,
    tds_default_regime: s.tds_default_regime,
    payslip_template: s.payslip_template,
    bonus_enabled: s.bonus_enabled,
    bonus_eligibility_ceiling: s.bonus_eligibility_ceiling,
    bonus_calculation_ceiling: s.bonus_calculation_ceiling,
    bonus_minimum_wage: s.bonus_minimum_wage,
    bonus_min_percent: s.bonus_min_percent,
    bonus_max_percent: s.bonus_max_percent,
    bonus_rate_percent: s.bonus_rate_percent,
    bonus_min_days: s.bonus_min_days,
    bonus_basis: s.bonus_basis,
    advance_enabled: s.advance_enabled,
    advance_default_percent: s.advance_default_percent,
    advance_max_percent: s.advance_max_percent,
    advance_allow_custom_amount: s.advance_allow_custom_amount,
    advance_basis: s.advance_basis,
  };
}

export function PayrollSettingsPanel() {
  const [form, setForm] = useState<PayrollSettingsPayload | null>(null);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPayrollSettings()
      .then((s) => setForm(toPayload(s)))
      .catch(() => toast.error("Could not load payroll settings"));
    listComponents().then(setComponents).catch(() => setComponents([]));
  }, []);

  function set<K extends keyof PayrollSettingsPayload>(
    key: K,
    value: PayrollSettingsPayload[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
  }

  async function onSave() {
    if (!form) return;
    setSaving(true);
    try {
      setForm(toPayload(await savePayrollSettings(form)));
      setDirty(false);
      toast.success("Saved — recalculate any draft run to apply");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Panel
        icon={CalendarDays}
        title="Pay basis"
        description="How a month's salary is divided into payable days."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {LOP_BASES.map((b) => {
            const active = form.lop_basis === b.value;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => set("lop_basis", b.value)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-card hover:bg-accent/40",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      active ? "text-brand-ink" : "text-foreground",
                    )}
                  >
                    {b.label}
                  </span>
                  {active && <Check className="size-4 text-brand-ink" />}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">
                  {b.hint}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumField
            label="Standard days per month"
            value={form.standard_days_per_month}
            onChange={(v) => set("standard_days_per_month", Number(v))}
            hint="Divisor for a day's pay."
          />
          <NumField
            label="Round net pay to"
            value={form.round_net_to}
            onChange={(v) => set("round_net_to", Number(v))}
            hint="0 keeps paise. 1 rounds to the rupee."
          />
        </div>
      </Panel>

      <Panel
        icon={Timer}
        title="Overtime & leave encashment"
        description="What happens to extra hours and an unused leave balance."
      >
        <Toggle
          label="Pay overtime"
          hint="Uses the overtime minutes attendance has already calculated."
          checked={form.pay_overtime}
          onChange={(v) => set("pay_overtime", v)}
        />
        <div
          className={cn(
            "grid gap-4 sm:grid-cols-2",
            !form.pay_overtime && "pointer-events-none opacity-50",
          )}
        >
          <SelectField
            label="Rate based on"
            value={form.overtime_rate_basis}
            onChange={(v) => set("overtime_rate_basis", v as "basic" | "gross")}
            options={[
              { value: "basic", label: "Basic" },
              { value: "gross", label: "Gross" },
            ]}
          />
          <NumField
            label="Multiplier"
            step="0.25"
            value={form.overtime_multiplier}
            onChange={(v) => set("overtime_multiplier", v)}
            hint="1.5 = time and a half."
          />
        </div>

        <Toggle
          label="Convert unused leave to salary"
          hint="When a leave type is set not to carry forward, the remaining balance is paid out instead of lapsing."
          checked={form.leave_encashment_enabled}
          onChange={(v) => set("leave_encashment_enabled", v)}
        />
        <div
          className={cn(
            "sm:w-1/2",
            !form.leave_encashment_enabled && "pointer-events-none opacity-50",
          )}
        >
          <SelectField
            label="Encashment rate based on"
            value={form.encashment_basis}
            onChange={(v) => set("encashment_basis", v as "basic" | "gross")}
            options={[
              { value: "basic", label: "Basic" },
              { value: "gross", label: "Gross" },
            ]}
          />
        </div>
      </Panel>

      <Panel
        icon={Landmark}
        title="Statutory"
        description="Rates and ceilings — change them here when the law does."
      >
        <Toggle
          label="Provident Fund"
          hint="Deducted from the components marked as counting towards PF."
          checked={form.pf_enabled}
          onChange={(v) => set("pf_enabled", v)}
        />
        <div
          className={cn(
            "grid gap-4 sm:grid-cols-3",
            !form.pf_enabled && "pointer-events-none opacity-50",
          )}
        >
          <NumField
            label="Employee %"
            value={form.pf_employee_percent}
            onChange={(v) => set("pf_employee_percent", v)}
          />
          <NumField
            label="Employer %"
            value={form.pf_employer_percent}
            onChange={(v) => set("pf_employer_percent", v)}
          />
          <NumField
            label="Wage ceiling"
            value={form.pf_wage_ceiling}
            onChange={(v) => set("pf_wage_ceiling", v)}
          />
        </div>
        <Toggle
          label="Cap PF at the wage ceiling"
          hint="Off calculates PF on the full PF wage, with no ceiling."
          checked={form.pf_cap_at_ceiling}
          onChange={(v) => set("pf_cap_at_ceiling", v)}
          disabled={!form.pf_enabled}
        />

        <Toggle
          label="ESI"
          hint="Applies only while the ESI wage stays under the ceiling."
          checked={form.esi_enabled}
          onChange={(v) => set("esi_enabled", v)}
        />
        <div
          className={cn(
            "grid gap-4 sm:grid-cols-3",
            !form.esi_enabled && "pointer-events-none opacity-50",
          )}
        >
          <NumField
            label="Employee %"
            step="0.01"
            value={form.esi_employee_percent}
            onChange={(v) => set("esi_employee_percent", v)}
          />
          <NumField
            label="Employer %"
            step="0.01"
            value={form.esi_employer_percent}
            onChange={(v) => set("esi_employer_percent", v)}
          />
          <NumField
            label="Gross ceiling"
            value={form.esi_gross_ceiling}
            onChange={(v) => set("esi_gross_ceiling", v)}
          />
        </div>

        <Toggle
          label="Professional Tax"
          hint="A flat monthly amount."
          checked={form.pt_enabled}
          onChange={(v) => set("pt_enabled", v)}
        />
        <div className={cn("sm:w-1/3", !form.pt_enabled && "pointer-events-none opacity-50")}>
          <NumField
            label="Amount"
            value={form.pt_amount}
            onChange={(v) => set("pt_amount", v)}
          />
        </div>

        <Toggle
          label="Income tax (TDS)"
          hint="Computes tax on projected annual salary and deducts a twelfth of the balance each month. While this is on, any TDS salary component is ignored so the tax is not charged twice."
          checked={form.tds_enabled}
          onChange={(v) => set("tds_enabled", v)}
        />
        <div
          className={cn(
            "sm:w-1/3",
            !form.tds_enabled && "pointer-events-none opacity-50",
          )}
        >
          <SelectField
            label="Default regime"
            value={form.tds_default_regime}
            onChange={(v) => set("tds_default_regime", v as "new" | "old")}
            options={[
              { value: "new", label: "New regime" },
              { value: "old", label: "Old regime" },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Used until an employee files a declaration choosing otherwise.
            Slabs and deductions live in the Income tax tab.
          </p>
        </div>
      </Panel>

      <Panel
        icon={Banknote}
        title="Salary advance"
        description="Part of a month's salary paid early, then netted off that same month's payslip. Not a loan — there is nothing to repay."
      >
        <Toggle
          label="Allow salary advances"
          hint="Turn off to stop any further advances being recorded."
          checked={form.advance_enabled}
          onChange={(v) => set("advance_enabled", v)}
        />
        <div
          className={cn(
            "space-y-4",
            !form.advance_enabled && "pointer-events-none opacity-50",
          )}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <NumField
              label="Default %"
              step="0.01"
              value={form.advance_default_percent}
              onChange={(v) => set("advance_default_percent", v)}
              hint="Pre-filled when giving an advance."
            />
            <NumField
              label="Maximum %"
              step="0.01"
              value={form.advance_max_percent}
              onChange={(v) => set("advance_max_percent", v)}
              hint="Total that may be drawn in one month."
            />
            <SelectField
              label="Percent of"
              value={form.advance_basis}
              onChange={(v) => set("advance_basis", v as "basic" | "gross")}
              options={[
                { value: "gross", label: "Gross salary" },
                { value: "basic", label: "Basic only" },
              ]}
            />
          </div>
          <Toggle
            label="Allow a custom amount"
            hint="Off restricts advances to a percentage of salary."
            checked={form.advance_allow_custom_amount}
            onChange={(v) => set("advance_allow_custom_amount", v)}
          />
        </div>
      </Panel>

      <Panel
        icon={Award}
        title="Statutory bonus"
        description="Payment of Bonus Act thresholds. Every figure is editable, since the ceilings are revised and the minimum wage varies by state."
      >
        <Toggle
          label="Enable statutory bonus"
          hint="Accrues from processed payslips; pay it out from the Payroll tab."
          checked={form.bonus_enabled}
          onChange={(v) => set("bonus_enabled", v)}
        />
        <div
          className={cn(
            "space-y-4",
            !form.bonus_enabled && "pointer-events-none opacity-50",
          )}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <NumField
              label="Eligibility ceiling"
              value={form.bonus_eligibility_ceiling}
              onChange={(v) => set("bonus_eligibility_ceiling", v)}
              hint="Monthly wage above which an employee is not covered."
            />
            <NumField
              label="Calculation ceiling"
              value={form.bonus_calculation_ceiling}
              onChange={(v) => set("bonus_calculation_ceiling", v)}
              hint="Bonus is reckoned on wage capped at this."
            />
            <NumField
              label="Minimum wage"
              value={form.bonus_minimum_wage}
              onChange={(v) => set("bonus_minimum_wage", v)}
              hint="The higher of this and the ceiling is used."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <NumField
              label="Minimum %"
              step="0.01"
              value={form.bonus_min_percent}
              onChange={(v) => set("bonus_min_percent", v)}
            />
            <NumField
              label="Maximum %"
              step="0.01"
              value={form.bonus_max_percent}
              onChange={(v) => set("bonus_max_percent", v)}
            />
            <NumField
              label="Default rate %"
              step="0.01"
              value={form.bonus_rate_percent}
              onChange={(v) => set("bonus_rate_percent", v)}
            />
            <NumField
              label="Qualifying days"
              value={form.bonus_min_days}
              onChange={(v) => set("bonus_min_days", Number(v))}
              hint="Days worked in the year."
            />
          </div>
          <div className="sm:w-1/3">
            <SelectField
              label="Reckoned on"
              value={form.bonus_basis}
              onChange={(v) => set("bonus_basis", v as "basic" | "basic_da" | "gross")}
              options={[
                { value: "basic_da", label: "Basic + DA" },
                { value: "basic", label: "Basic only" },
                { value: "gross", label: "Gross" },
              ]}
            />
          </div>
        </div>
      </Panel>

      <ComponentsPanel components={components} onChange={setComponents} />

      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/95 px-5 py-3.5 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {dirty
            ? "Unsaved changes. Recalculate a draft run to apply them."
            : "All changes saved."}
        </p>
        <Button onClick={onSave} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ComponentsPanel({
  components,
  onChange,
}: {
  components: SalaryComponent[];
  onChange: (c: SalaryComponent[]) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const created = await createComponent({
        code: `NEW_${components.length + 1}`,
        name: "New component",
        kind: "earning",
        calculation: "fixed",
        value: "0",
        sort_order: components.length + 1,
      });
      onChange([...components, created]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  async function save(row: SalaryComponent, patch: Partial<SalaryComponent>) {
    const next = { ...row, ...patch };
    onChange(components.map((c) => (c.id === row.id ? next : c)));
    try {
      await updateComponent(row.id, next);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  async function remove(row: SalaryComponent) {
    if (!window.confirm(`Delete “${row.name}”?`)) return;
    try {
      await deleteComponent(row.id);
      onChange(components.filter((c) => c.id !== row.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  return (
    <Panel
      icon={Wallet}
      title="Salary structure"
      description="How the monthly gross is split across payslip lines. Use one “balance of gross” line so the parts always add up."
      action={
        <Button size="sm" variant="outline" onClick={add} disabled={busy}>
          <Plus className="size-4" />
          Add
        </Button>
      }
    >
      {components.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No components yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {components.map((c) => (
            <li
              key={c.id}
              className="grid items-end gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-[1.4fr_1fr_1.2fr_0.8fr_auto]"
            >
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Name</Label>
                <Input
                  defaultValue={c.name}
                  onBlur={(e) => save(c, { name: e.target.value })}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Code</Label>
                <Input
                  defaultValue={c.code}
                  onBlur={(e) => save(c, { code: e.target.value })}
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Calculation</Label>
                <Select
                  value={c.calculation}
                  onValueChange={(v) =>
                    save(c, { calculation: v as SalaryComponent["calculation"] })
                  }
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPONENT_CALCS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  defaultValue={c.value}
                  disabled={c.calculation === "balance"}
                  onBlur={(e) => save(c, { value: e.target.value })}
                  className="h-8"
                />
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "capitalize",
                    c.kind === "deduction" && "text-destructive",
                  )}
                >
                  {c.kind}
                </Badge>
                <IconButton
                  label="Delete component"
                  icon={Trash2}
                  variant="destructive"
                  onClick={() => remove(c)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 sm:col-span-5">
                <MiniToggle
                  label="Reduce on LOP"
                  checked={c.prorate_on_lop}
                  onChange={(v) => save(c, { prorate_on_lop: v })}
                />
                <MiniToggle
                  label="Counts for PF"
                  checked={c.include_in_pf}
                  onChange={(v) => save(c, { include_in_pf: v })}
                />
                <MiniToggle
                  label="Counts for ESI"
                  checked={c.include_in_esi}
                  onChange={(v) => save(c, { include_in_esi: v })}
                />
                <MiniToggle
                  label="Deduction"
                  checked={c.kind === "deduction"}
                  onChange={(v) => save(c, { kind: v ? "deduction" : "earning" })}
                />
                <MiniToggle
                  label="Active"
                  checked={c.is_active}
                  onChange={(v) => save(c, { is_active: v })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}


/* ------------------------------------------------------------------ */

function Panel({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-t border-border/50 pt-4 first:border-0 first:pt-0",
        disabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}

function MiniToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      {label}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  hint,
  step,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">{label}</Label>
      <Input
        type="number"
        step={step ?? "1"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
