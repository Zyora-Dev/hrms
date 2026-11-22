"use client";

import { useState } from "react";
import { ArrowRightLeft, Loader2, Save } from "lucide-react";
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
import {
  ApiError,
  hours,
  setContinuation,
  shiftSpan,
  type AttendanceDay,
  type ContinuationMode,
} from "@/lib/attendance";
import { cn } from "@/lib/utils";

const MODES: {
  value: ContinuationMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "auto",
    label: "From punches",
    hint: "Work it out from the scans, biometric or manual. The default.",
  },
  {
    value: "forced",
    label: "Mark as continued",
    hint: "They stayed on but the out-scan never landed. You supply the time.",
  },
  {
    value: "excluded",
    label: "Not a continuation",
    hint: "A stray scan hours later made this look like a spill.",
  },
];

export function ContinuationDialog({
  day,
  onClose,
  onSaved,
}: {
  day: AttendanceDay;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<ContinuationMode>(day.continuation_mode);
  const [minutes, setMinutes] = useState(
    String(day.continuation_override_minutes || day.continued_minutes || 60),
  );
  const [note, setNote] = useState(day.continuation_note ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await setContinuation(day.id, {
        mode,
        minutes: mode === "forced" ? Number(minutes) : 0,
        note: note.trim() || null,
      });
      toast.success("Continuation updated — the day was recalculated");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="size-4 text-brand-ink" />
            Continued shift
          </DialogTitle>
          <DialogDescription>
            {day.employee_name} · {day.attendance_date}
            {day.shift_name ? ` · ${day.shift_name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Punches currently show{" "}
            <span className="font-semibold text-foreground">
              {day.is_continued
                ? `${hours(day.continued_minutes)} past the shift end` +
                  (shiftSpan(day.continued_shifts)
                    ? ` — ${shiftSpan(day.continued_shifts)}`
                    : "")
                : "no continuation"}
            </span>
            {day.continued_into_shift_name
              ? ` — into the ${day.continued_into_shift_name} shift`
              : ""}
            .
          </div>

          <div className="space-y-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                  mode === m.value
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-card hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "block text-xs font-semibold",
                    mode === m.value && "text-brand-ink",
                  )}
                >
                  {m.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {m.hint}
                </span>
              </button>
            ))}
          </div>

          {mode === "forced" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Minutes past the shift end *
              </Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Paid as overtime if your attendance settings allow it.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Covered the night shift, reader was down"
              className="h-9"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
