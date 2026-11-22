"use client";

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  WEEKDAYS,
  createShift,
  duration,
  emptyShift,
  updateShift,
  type Shift,
  type ShiftPayload,
} from "@/lib/shifts";
import { cn } from "@/lib/utils";

function toPayload(shift: Shift): ShiftPayload {
  return {
    name: shift.name,
    code: shift.code,
    start_time: shift.start_time.slice(0, 5),
    end_time: shift.end_time.slice(0, 5),
    break_minutes: shift.break_minutes,
    grace_in_minutes: shift.grace_in_minutes,
    grace_out_minutes: shift.grace_out_minutes,
    full_day_minutes: shift.full_day_minutes,
    half_day_minutes: shift.half_day_minutes,
    max_continuation_shifts: shift.max_continuation_shifts,
    early_in_hours: shift.early_in_hours,
    weekly_offs: shift.weekly_offs,
    is_active: shift.is_active,
  };
}

/** Shortcuts only — the box beside them takes any number. */
const CONTINUATION_CHOICES = [
  { value: 0, label: "None" },
  { value: 0.5, label: "Half" },
  { value: 1, label: "1 shift" },
  { value: 2, label: "2 shifts" },
  { value: 3, label: "3 shifts" },
];

/** Live preview of the window the engine will use. */
function previewWindow(form: ShiftPayload) {
  const [sh, sm] = form.start_time.split(":").map(Number);
  const [eh, em] = form.end_time.split(":").map(Number);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  const overnight = end <= start;
  if (overnight) end += 24 * 60;
  const total = end - start;
  return {
    overnight,
    total,
    paid: Math.max(total - form.break_minutes, 0),
    continuation: Math.round(total * Number(form.max_continuation_shifts || 0)),
  };
}

export function ShiftForm({
  open,
  shift,
  onClose,
  onSaved,
}: {
  open: boolean;
  shift: Shift | null;
  onClose: () => void;
  onSaved: (s: Shift) => void;
}) {
  const [form, setForm] = useState<ShiftPayload>(() =>
    shift ? toPayload(shift) : emptyShift(),
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ShiftPayload>(key: K, value: ShiftPayload[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleOff(day: number) {
    setForm((f) => ({
      ...f,
      weekly_offs: f.weekly_offs.includes(day)
        ? f.weekly_offs.filter((d) => d !== day)
        : [...f.weekly_offs, day].sort(),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = shift
        ? await updateShift(shift.id, form)
        : await createShift(form);
      onSaved(saved);
      toast.success(shift ? "Shift updated" : `${saved.name} created`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save shift");
    } finally {
      setSaving(false);
    }
  }

  const preview = previewWindow(form);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/60 p-5">
          <DialogTitle>{shift ? "Edit shift" : "New shift"}</DialogTitle>
          <DialogDescription>
            Timings drive how punches are matched to a working day.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <div className="max-h-[62vh] space-y-5 overflow-y-auto p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-sm font-semibold">Shift name *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="General / Night / Early morning"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Code *</Label>
                <Input
                  required
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  placeholder="GEN"
                  maxLength={16}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Start time *</Label>
                <Input
                  required
                  type="time"
                  value={form.start_time}
                  onChange={(e) => set("start_time", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">End time *</Label>
                <Input
                  required
                  type="time"
                  value={form.end_time}
                  onChange={(e) => set("end_time", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Break (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.break_minutes}
                  onChange={(e) => set("break_minutes", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-semibold">
                {duration(preview.total)} total · {duration(preview.paid)} paid
              </span>
              {preview.overnight && (
                <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-brand-ink">
                  Overnight — ends next day
                </span>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                A full day counts at {duration(preview.paid)} unless you override
                it below.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Late grace (min)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={form.grace_in_minutes}
                  onChange={(e) =>
                    set("grace_in_minutes", Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Early-exit grace (min)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={form.grace_out_minutes}
                  onChange={(e) =>
                    set("grace_out_minutes", Number(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Continuation allowance (shifts)
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {CONTINUATION_CHOICES.map((c) => {
                    const on = Number(form.max_continuation_shifts) === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() =>
                          set("max_continuation_shifts", String(c.value))
                        }
                        className={cn(
                          "h-8 rounded-lg border px-3 text-xs font-medium transition-colors",
                          on
                            ? "border-brand-ink bg-brand-ink font-semibold text-white"
                            : "border-border bg-card text-muted-foreground hover:bg-accent/40",
                        )}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                  <Input
                    type="number"
                    min={0}
                    step="0.25"
                    value={form.max_continuation_shifts}
                    onChange={(e) =>
                      set("max_continuation_shifts", e.target.value)
                    }
                    className="h-8 w-24 text-xs"
                    aria-label="Continuation allowance in shifts"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  How much more work can still count towards this day, measured
                  in shifts rather than a fixed number of hours. The buttons are
                  shortcuts — type any number you like, there is no ceiling.
                </p>
                <p className="text-xs font-medium text-foreground">
                  {preview.continuation > 0
                    ? `Punches up to ${duration(preview.continuation)} past the end still count towards this day.`
                    : "Punches after the shift ends start a new day."}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Early entry window (hours)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={12}
                  value={form.early_in_hours}
                  onChange={(e) => set("early_in_hours", Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  How early before the start a punch counts for this day.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Weekly offs</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = form.weekly_offs.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleOff(d.value)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                        on
                          ? "border-brand-ink bg-brand-ink text-white"
                          : "border-border bg-card text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch
                id="shift-active"
                checked={form.is_active}
                onCheckedChange={(v) => set("is_active", v)}
              />
              <Label htmlFor="shift-active" className="text-sm font-normal">
                Active — available for assignment
              </Label>
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 p-5">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              <X className="size-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {shift ? "Save changes" : "Create shift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
