"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Ban,
  CalendarOff,
  ChevronDown,
  Coins,
  Loader2,
  Plus,
  Trash2,
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
  createLeaveType,
  deleteLeaveType,
  listLeaveTypes,
  updateLeaveType,
  type LeaveType,
} from "@/lib/payroll";
import { cn } from "@/lib/utils";

/**
 * Carry forward / encash / lapse are mutually exclusive, so they are one
 * three-way choice rather than two toggles that can contradict each other.
 */
type Leftover = "carry" | "encash" | "lapse";

const LEFTOVER: { value: Leftover; label: string; hint: string; icon: React.ElementType }[] =
  [
    {
      value: "carry",
      label: "Carry forward",
      hint: "Unused days roll into the next month.",
      icon: ArrowRight,
    },
    {
      value: "encash",
      label: "Convert to salary",
      hint: "Unused days are paid out with the salary.",
      icon: Coins,
    },
    {
      value: "lapse",
      label: "Lapse",
      hint: "Unused days are simply lost.",
      icon: Ban,
    },
  ];

function leftoverOf(l: LeaveType): Leftover {
  if (l.carry_forward) return "carry";
  if (l.encash_unused) return "encash";
  return "lapse";
}

function leftoverPatch(value: Leftover): Partial<LeaveType> {
  return {
    carry_forward: value === "carry",
    encash_unused: value === "encash",
  };
}

export function LeavePolicyPanel() {
  const [items, setItems] = useState<LeaveType[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listLeaveTypes()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  async function save(row: LeaveType, patch: Partial<LeaveType>) {
    const next = { ...row, ...patch };
    setItems((prev) => (prev ?? []).map((l) => (l.id === row.id ? next : l)));
    try {
      await updateLeaveType(row.id, next);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  async function add() {
    setAdding(true);
    try {
      const created = await createLeaveType({
        code: `L${(items?.length ?? 0) + 1}`,
        name: "New leave type",
        monthly_accrual: "1",
        carry_forward: false,
        encash_unused: true,
        encashment_percent: "100",
      });
      setItems((prev) => [...(prev ?? []), created]);
      setOpenId(created.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add");
    } finally {
      setAdding(false);
    }
  }

  async function remove(row: LeaveType) {
    if (!window.confirm(`Delete “${row.name}”?`)) return;
    try {
      await deleteLeaveType(row.id);
      setItems((prev) => (prev ?? []).filter((l) => l.id !== row.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  if (items === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Leave types</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Accrual, who may apply, and what happens to the balance left at the
            end of the month.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={add} disabled={adding}>
          {adding ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Add leave type
        </Button>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <CalendarOff className="size-4" />
          </span>
          <p className="text-sm font-semibold">No leave types yet</p>
          <p className="text-xs text-muted-foreground">
            Add one to let employees apply for leave.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((l) => {
            const open = openId === l.id;
            const leftover = leftoverOf(l);
            const summary = LEFTOVER.find((o) => o.value === leftover)!;

            return (
              <li
                key={l.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card transition-colors",
                  open ? "border-primary/40" : "border-border/60",
                  !l.is_active && "opacity-60",
                )}
              >
                {/* ---- summary row ---- */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : l.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {l.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px] font-semibold"
                        >
                          {l.code}
                        </Badge>
                        {!l.is_active && (
                          <Badge variant="outline" className="text-[10px]">
                            Inactive
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {l.monthly_accrual}/month
                        </span>
                        <Dot />
                        <span className="inline-flex items-center gap-1">
                          <summary.icon className="size-3" />
                          {summary.label}
                        </span>
                        <Dot />
                        <span>
                          {l.requires_approval ? "Needs approval" : "Auto-approved"}
                        </span>
                        {l.applies_to !== "all" && (
                          <>
                            <Dot />
                            <span className="capitalize">{l.applies_to} only</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>

                  <Switch
                    checked={l.is_active}
                    onCheckedChange={(v) => save(l, { is_active: v })}
                    aria-label={`${l.is_active ? "Deactivate" : "Activate"} ${l.name}`}
                  />
                  <IconButton
                    label="Delete leave type"
                    icon={Trash2}
                    variant="destructive"
                    size="sm"
                    onClick={() => remove(l)}
                  />
                </div>

                {/* ---- detail ---- */}
                {open && (
                  <div className="space-y-6 border-t border-border/60 bg-muted/20 px-4 py-5">
                    <Section title="Basics">
                      <Field label="Name" className="sm:col-span-2">
                        <Input
                          defaultValue={l.name}
                          onBlur={(e) => save(l, { name: e.target.value })}
                        />
                      </Field>
                      <Field label="Code">
                        <Input
                          defaultValue={l.code}
                          onBlur={(e) => save(l, { code: e.target.value })}
                          className="font-mono"
                        />
                      </Field>
                      <Field label="Accrual per month" suffix="days">
                        <Input
                          type="number"
                          step="0.5"
                          min={0}
                          defaultValue={l.monthly_accrual}
                          onBlur={(e) =>
                            save(l, { monthly_accrual: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Annual cap" hint="Blank for no cap">
                        <Input
                          type="number"
                          min={0}
                          placeholder="None"
                          defaultValue={l.annual_cap ?? ""}
                          onBlur={(e) =>
                            save(l, { annual_cap: e.target.value || null })
                          }
                        />
                      </Field>
                      <div className="flex items-end pb-1">
                        <Toggle
                          label="Paid leave"
                          checked={l.is_paid}
                          onChange={(v) => save(l, { is_paid: v })}
                        />
                      </div>
                    </Section>

                    <Section title="Who can apply, and when">
                      <Field label="Notice required" suffix="days">
                        <Input
                          type="number"
                          min={0}
                          defaultValue={l.min_notice_days}
                          onBlur={(e) =>
                            save(l, { min_notice_days: Number(e.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Max consecutive" hint="Blank for no limit">
                        <Input
                          type="number"
                          min={0}
                          placeholder="No limit"
                          defaultValue={l.max_consecutive_days ?? ""}
                          onBlur={(e) =>
                            save(l, { max_consecutive_days: e.target.value || null })
                          }
                        />
                      </Field>
                      <Field label="Eligible after" suffix="days of service">
                        <Input
                          type="number"
                          min={0}
                          defaultValue={l.applicable_after_days}
                          onBlur={(e) =>
                            save(l, {
                              applicable_after_days: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="Applies to">
                        <Select
                          value={l.applies_to}
                          onValueChange={(v) =>
                            save(l, { applies_to: v as LeaveType["applies_to"] })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Everyone</SelectItem>
                            <SelectItem value="female">Female only</SelectItem>
                            <SelectItem value="male">Male only</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <div className="sm:col-span-4">
                        <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-border/60 bg-card px-4 py-3">
                          <Toggle
                            label="Needs approval"
                            hint="Off approves immediately."
                            checked={l.requires_approval}
                            onChange={(v) => save(l, { requires_approval: v })}
                          />
                          <Toggle
                            label="Half day allowed"
                            checked={l.allow_half_day}
                            onChange={(v) => save(l, { allow_half_day: v })}
                          />
                          <Toggle
                            label="Allow negative balance"
                            hint="Lets staff go into deficit."
                            checked={l.allow_negative_balance}
                            onChange={(v) =>
                              save(l, { allow_negative_balance: v })
                            }
                          />
                        </div>
                      </div>
                    </Section>

                    <Section title="Balance left at month end" columns={1}>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {LEFTOVER.map((o) => {
                          const active = leftover === o.value;
                          const Icon = o.icon;
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => save(l, leftoverPatch(o.value))}
                              className={cn(
                                "rounded-lg border p-3 text-left transition-colors",
                                active
                                  ? "border-primary/40 bg-primary/10"
                                  : "border-border bg-card hover:bg-accent/40",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex items-center gap-1.5 text-xs font-semibold",
                                  active ? "text-brand-ink" : "text-foreground",
                                )}
                              >
                                <Icon className="size-3.5" />
                                {o.label}
                              </span>
                              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                                {o.hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {leftover !== "lapse" && (
                        <div className="mt-3 grid gap-4 sm:grid-cols-4">
                          {leftover === "encash" && (
                            <Field
                              label="Encashment rate"
                              suffix="% of a day"
                              hint="100 pays a full day per unused day."
                            >
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                defaultValue={l.encashment_percent}
                                onBlur={(e) =>
                                  save(l, { encashment_percent: e.target.value })
                                }
                              />
                            </Field>
                          )}
                          {leftover === "carry" && (
                            <Field
                              label="Carry-forward cap"
                              suffix="days"
                              hint="Anything above this lapses."
                            >
                              <Input
                                type="number"
                                min={0}
                                placeholder="No cap"
                                defaultValue={l.carry_forward_cap ?? ""}
                                onBlur={(e) =>
                                  save(l, {
                                    carry_forward_cap: e.target.value || null,
                                  })
                                }
                              />
                            </Field>
                          )}
                        </div>
                      )}
                    </Section>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Dot() {
  return <span className="text-muted-foreground/40">·</span>;
}

function Section({
  title,
  columns = 4,
  children,
}: {
  title: string;
  columns?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      <div
        className={cn(
          "grid gap-4",
          columns === 4 ? "sm:grid-cols-4" : "grid-cols-1",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  suffix,
  hint,
  className,
  children,
}: {
  label: string;
  suffix?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-[11px] font-semibold">
        {label}
        {suffix && (
          <span className="ml-1 font-normal text-muted-foreground">{suffix}</span>
        )}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        {hint && (
          <span className="block text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}
