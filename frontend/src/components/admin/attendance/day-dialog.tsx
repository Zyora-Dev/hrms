"use client";

import { useState } from "react";
import {
  ArrowRightLeft,
  Eraser,
  LogIn,
  LogOut,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/admin/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  MANUAL_STATUSES,
  addManualPunch,
  clearDay,
  clock,
  deletePunch,
  hours,
  setDayStatus,
  statusLabel,
  statusTone,
  type DayRosterEntry,
  type ManualStatus,
} from "@/lib/attendance";
import { cn } from "@/lib/utils";

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function DayDialog({
  entry,
  attendanceDate,
  onClose,
  onChanged,
}: {
  entry: DayRosterEntry;
  attendanceDate: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  // Read off the clock on open, not at render, so nothing depends on the
  // current time while the page is being prerendered.
  const [time, setTime] = useState(nowHHMM);
  const [note, setNote] = useState(entry.day?.status_note ?? "");
  const [busy, setBusy] = useState(false);

  const day = entry.day;
  const marked = entry.status !== "not_marked";
  const working = !marked && !!day?.first_in && !day?.last_out;

  async function punch(direction: "in" | "out") {
    setBusy(true);
    try {
      await addManualPunch({
        employee_id: entry.employee_id,
        punch_at: `${attendanceDate}T${time}:00`,
        direction,
        note: note.trim() || undefined,
      });
      toast.success(
        `Punched ${direction} at ${time} for ${entry.employee_name}`,
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not punch");
    } finally {
      setBusy(false);
    }
  }

  async function mark(status: ManualStatus | null) {
    setBusy(true);
    try {
      const saved = await setDayStatus({
        employee_id: entry.employee_id,
        attendance_date: attendanceDate,
        status,
        note: note.trim() || null,
      });
      toast.success(
        status
          ? `Marked ${statusLabel(saved.status).toLowerCase()}`
          : "Back to whatever the punches say",
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function wipe() {
    if (
      !window.confirm(
        `Clear ${entry.employee_name}'s attendance for ${attendanceDate}? ` +
          "The punches for that day go with it.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await clearDay(day!.id);
      toast.success("Day cleared");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not clear");
    } finally {
      setBusy(false);
    }
  }

  async function removePunch(id: number) {
    setBusy(true);
    try {
      await deletePunch(id);
      toast.success("Punch removed");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">{entry.employee_name}</DialogTitle>
          <DialogDescription>
            {attendanceDate} · {entry.employee_code}
            {entry.shift_name
              ? ` · ${entry.shift_name} ${entry.shift_window ?? ""}`
              : " · no shift assigned"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* where the day stands */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                statusTone(entry.status),
              )}
            >
              {working
                ? `In since ${clock(day!.first_in, attendanceDate)}`
                : marked
                  ? statusLabel(entry.status)
                  : "Not marked yet"}
            </span>
            {entry.is_overridden && (
              <span className="text-[11px] font-semibold text-brand-ink">
                set by hand
              </span>
            )}
            {day && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                In {clock(day.first_in, attendanceDate)} · Out{" "}
                {clock(day.last_out, attendanceDate)} ·{" "}
                {hours(day.worked_minutes)} worked
                {day.is_continued
                  ? ` · continued ${hours(day.continued_minutes)}`
                  : ""}
              </span>
            )}
          </div>

          {/* punching */}
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Punch
            </Label>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-8 w-[110px] text-xs"
                aria-label="Punch time"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => punch("in")}
              >
                <LogIn className="size-3.5" />
                Punch in
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => punch("out")}
              >
                <LogOut className="size-3.5" />
                Punch out
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Status follows the hours once they punch out.
              </span>
            </div>

            {entry.punches.length > 0 && (
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {entry.punches.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card py-0.5 pl-2.5 pr-1 text-[11px]"
                  >
                    <span className="font-mono font-semibold">
                      {clock(p.punch_at, attendanceDate)}
                    </span>
                    <span className="capitalize text-muted-foreground">
                      {p.direction === "auto" ? p.source : p.direction}
                    </span>
                    <IconButton
                      label="Remove punch"
                      icon={Trash2}
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => removePunch(p.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* marking by hand */}
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Or mark the day
            </Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MANUAL_STATUSES.map((s) => {
                const active = entry.is_overridden && entry.status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={busy}
                    onClick={() => mark(s.value)}
                    className={cn(
                      "h-8 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50",
                      active
                        ? "border-brand-ink bg-brand-ink font-semibold text-white"
                        : "border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
              {entry.is_overridden && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  disabled={busy}
                  onClick={() => mark(null)}
                >
                  <RotateCcw className="size-3.5" />
                  Use the punches
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Forgot to scan / out on client site"
              className="h-8 text-xs"
            />
          </div>

          {day && (
            <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
              <p className="text-[11px] text-muted-foreground">
                Clearing wipes the punches, the marks and the totals for this
                day. A paid month cannot be changed.
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={wipe}
              >
                <Eraser className="size-3.5" />
                Clear day
              </Button>
            </div>
          )}

          {day?.is_continued && (
            <p className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-[11px] text-brand-ink">
              <ArrowRightLeft className="size-3.5 shrink-0" />
              Continued {hours(day.continued_minutes)} past the shift end
              {day.continued_into_shift_name
                ? ` — into the ${day.continued_into_shift_name} shift`
                : ""}
              .
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
