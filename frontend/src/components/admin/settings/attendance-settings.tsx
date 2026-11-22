"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  Clock,
  Hand,
  Loader2,
  Save,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { WEEKDAYS } from "@/lib/shifts";
import {
  ApiError,
  PAYROLL_BASES,
  getAttendanceSettings,
  saveAttendanceSettings,
  type AttendanceSettings,
  type AttendanceSettingsPayload,
  type PayrollBasis,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

const ROUNDING = [0, 5, 10, 15, 30];

function toPayload(s: AttendanceSettings): AttendanceSettingsPayload {
  return {
    payroll_basis: s.payroll_basis,
    standard_monthly_days: s.standard_monthly_days,
    round_punch_minutes: s.round_punch_minutes,
    overtime_enabled: s.overtime_enabled,
    overtime_min_minutes: s.overtime_min_minutes,
    overtime_max_minutes_per_day: s.overtime_max_minutes_per_day,
    overtime_multiplier: s.overtime_multiplier,
    continuation_counts_as_overtime: s.continuation_counts_as_overtime,
    auto_absent_without_punch: s.auto_absent_without_punch,
    allow_manual_punch: s.allow_manual_punch,
    manual_punch_requires_reason: s.manual_punch_requires_reason,
    week_starts_on: s.week_starts_on,
  };
}

export function AttendanceSettingsPanel() {
  const [form, setForm] = useState<AttendanceSettingsPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    getAttendanceSettings()
      .then((s) => alive && setForm(toPayload(s)))
      .catch((err) =>
        toast.error(
          err instanceof ApiError ? err.message : "Could not load settings",
        ),
      );
    return () => {
      alive = false;
    };
  }, []);

  function set<K extends keyof AttendanceSettingsPayload>(
    key: K,
    value: AttendanceSettingsPayload[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
  }

  async function onSave() {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await saveAttendanceSettings(form);
      setForm(toPayload(saved));
      setDirty(false);
      toast.success("Settings saved — recalculate to apply to past days");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payroll basis */}
      <Panel
        icon={CalendarDays}
        title="Payroll basis"
        description="What a day of attendance is worth when payroll runs."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {PAYROLL_BASES.map((b) => {
            const active = form.payroll_basis === b.value;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => set("payroll_basis", b.value as PayrollBasis)}
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

        {form.payroll_basis !== "shift_hours" && (
          <Row
            label="Standard days per month"
            hint="Divisor used to derive a day's pay from the monthly salary."
          >
            <Input
              type="number"
              min={1}
              max={31}
              value={form.standard_monthly_days}
              onChange={(e) =>
                set("standard_monthly_days", Number(e.target.value))
              }
              className="w-28"
            />
          </Row>
        )}
      </Panel>

      {/* Overtime */}
      <Panel
        icon={Timer}
        title="Overtime"
        description="How time worked beyond the shift is treated."
      >
        <Toggle
          label="Pay overtime"
          hint="Turn off to record extra hours without paying them."
          checked={form.overtime_enabled}
          onChange={(v) => set("overtime_enabled", v)}
        />

        <div
          className={cn(
            "space-y-4 transition-opacity",
            !form.overtime_enabled && "pointer-events-none opacity-50",
          )}
        >
          <Toggle
            icon={ArrowRightLeft}
            label="Count continued shifts as overtime"
            hint="When someone carries on into the next shift, pay the spill as overtime. The continuation is recorded either way."
            checked={form.continuation_counts_as_overtime}
            onChange={(v) => set("continuation_counts_as_overtime", v)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Minimum to count"
              hint="Spills shorter than this are ignored."
              suffix="min"
            >
              <Input
                type="number"
                min={0}
                value={form.overtime_min_minutes}
                onChange={(e) =>
                  set("overtime_min_minutes", Number(e.target.value))
                }
              />
            </Field>
            <Field
              label="Daily cap"
              hint="Most overtime payable in one day."
              suffix="min"
            >
              <Input
                type="number"
                min={0}
                value={form.overtime_max_minutes_per_day}
                onChange={(e) =>
                  set("overtime_max_minutes_per_day", Number(e.target.value))
                }
              />
            </Field>
            <Field label="Rate multiplier" hint="1.5 = time and a half." suffix="×">
              <Input
                type="number"
                step="0.25"
                min={0}
                value={form.overtime_multiplier}
                onChange={(e) => set("overtime_multiplier", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      {/* Punch handling */}
      <Panel
        icon={Clock}
        title="Punch handling"
        description="How raw device events are treated before calculation."
      >
        <Row
          label="Round punches to"
          hint="Smooths device clock drift. Off keeps the exact time."
        >
          <div className="flex flex-wrap gap-1.5">
            {ROUNDING.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("round_punch_minutes", m)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  form.round_punch_minutes === m
                    ? "border-brand-ink bg-brand-ink text-white"
                    : "border-border bg-card text-muted-foreground hover:bg-accent",
                )}
              >
                {m === 0 ? "Off" : `${m}m`}
              </button>
            ))}
          </div>
        </Row>

        <Toggle
          label="Mark absent when there is no punch"
          hint="Off leaves the day blank so it can be marked by hand."
          checked={form.auto_absent_without_punch}
          onChange={(v) => set("auto_absent_without_punch", v)}
        />
      </Panel>

      {/* Manual entry */}
      <Panel
        icon={Hand}
        title="Manual entry"
        description="Controls for punches added by an administrator."
      >
        <Toggle
          label="Allow manual punches"
          hint="Needed when the device is offline or a scan is missed."
          checked={form.allow_manual_punch}
          onChange={(v) => set("allow_manual_punch", v)}
        />
        <Toggle
          label="Require a reason"
          hint="Keeps an audit trail for every hand-entered punch."
          checked={form.manual_punch_requires_reason}
          onChange={(v) => set("manual_punch_requires_reason", v)}
          disabled={!form.allow_manual_punch}
        />

        <Row label="Week starts on" hint="Used by the roster chart and reports.">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => set("week_starts_on", d.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  form.week_starts_on === d.value
                    ? "border-brand-ink bg-brand-ink text-white"
                    : "border-border bg-card text-muted-foreground hover:bg-accent",
                )}
              >
                {d.short}
              </button>
            ))}
          </div>
        </Row>
      </Panel>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/95 px-5 py-3.5 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {dirty
            ? "Unsaved changes. New punches use these rules immediately; use Recalculate on the attendance page to apply them to past days."
            : "All changes saved."}
        </p>
        <Button type="button" onClick={onSave} disabled={saving || !dirty}>
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

function Panel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
          <Icon className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border/50 pt-4 first:border-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  icon?: React.ElementType;
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
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-brand-ink" />}
          {label}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
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

function Field({
  label,
  hint,
  suffix,
  children,
}: {
  label: string;
  hint: string;
  suffix: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">
        {label}
        <span className="ml-1 font-normal text-muted-foreground">({suffix})</span>
      </Label>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
