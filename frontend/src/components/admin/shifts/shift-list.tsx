"use client";

import { useEffect, useState } from "react";
import { Clock, Moon, Pencil, Plus, Sun, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignDialog } from "./assign-dialog";
import { ShiftForm } from "./shift-form";
import {
  ApiError,
  WEEKDAYS,
  deleteShift,
  duration,
  hhmm,
  listShifts,
  type Shift,
} from "@/lib/shifts";
import { today } from "@/lib/attendance";
import { cn } from "@/lib/utils";

export function ShiftList() {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [assigning, setAssigning] = useState<Shift | null>(null);
  const [assignFrom, setAssignFrom] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    listShifts(true)
      .then((rows) => alive && setShifts(rows))
      .catch(() => alive && setShifts([]));
    return () => {
      alive = false;
    };
  }, [reload]);

  async function onDelete(shift: Shift) {
    if (!window.confirm(`Delete “${shift.name}”? This cannot be undone.`)) return;
    try {
      await deleteShift(shift.id);
      setShifts((prev) => (prev ?? []).filter((s) => s.id !== shift.id));
      toast.success("Shift deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {shifts === null
            ? "Loading shifts…"
            : `${shifts.length} shift${shifts.length === 1 ? "" : "s"}`}
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          New shift
        </Button>
      </div>

      {shifts === null ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">No shifts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a shift before attendance can be calculated.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            New shift
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shifts.map((shift) => (
            <article
              key={shift.id}
              className={cn(
                "rounded-xl border bg-card p-5 transition-colors",
                shift.is_active
                  ? "border-border/60 hover:border-primary/40"
                  : "border-dashed border-border opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold">
                      {shift.name}
                    </h3>
                    <Badge variant="secondary" className="font-mono font-semibold">
                      {shift.code}
                    </Badge>
                    {!shift.is_active && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-brand-ink">
                    {shift.is_overnight ? (
                      <Moon className="size-4" />
                    ) : (
                      <Sun className="size-4" />
                    )}
                    {hhmm(shift.start_time)} – {hhmm(shift.end_time)}
                    {shift.is_overnight && (
                      <span className="text-xs font-medium text-muted-foreground">
                        (next day)
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <IconButton
                    label="Assign employees"
                    icon={Users}
                    variant="brand"
                    onClick={() => {
                      setAssignFrom(today());
                      setAssigning(shift);
                    }}
                  />
                  <IconButton
                    label="Edit shift"
                    icon={Pencil}
                    variant="neutral"
                    onClick={() => {
                      setEditing(shift);
                      setFormOpen(true);
                    }}
                  />
                  <IconButton
                    label="Delete shift"
                    icon={Trash2}
                    variant="destructive"
                    disabled={shift.assigned_count > 0}
                    onClick={() => onDelete(shift)}
                  />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <Stat label="Paid hours" value={duration(shift.paid_minutes)} />
                <Stat label="Break" value={`${shift.break_minutes}m`} />
                <Stat
                  label="Grace in / out"
                  value={`${shift.grace_in_minutes}m / ${shift.grace_out_minutes}m`}
                />
                <Stat
                  label="Continuation"
                  value={
                    Number(shift.max_continuation_shifts) > 0
                      ? `${Number(shift.max_continuation_shifts)} shift${
                          Number(shift.max_continuation_shifts) === 1 ? "" : "s"
                        } · ${duration(shift.continuation_window_minutes)}`
                      : "None"
                  }
                />
                <Stat label="Early entry" value={`${shift.early_in_hours}h`} />
                <Stat
                  label="Assigned"
                  value={`${shift.assigned_count} employee${shift.assigned_count === 1 ? "" : "s"}`}
                />
              </dl>

              {shift.weekly_offs.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Weekly off:{" "}
                  <span className="font-semibold text-foreground">
                    {shift.weekly_offs
                      .map((d) => WEEKDAYS.find((w) => w.value === d)?.short)
                      .join(", ")}
                  </span>
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {formOpen && (
        <ShiftForm
          open={formOpen}
          shift={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setReload((r) => r + 1);
          }}
        />
      )}

      <AssignDialog
        shift={assigning}
        defaultFrom={assignFrom}
        onClose={() => setAssigning(null)}
        onChanged={() => setReload((r) => r + 1)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold text-foreground">{value}</dd>
    </div>
  );
}
