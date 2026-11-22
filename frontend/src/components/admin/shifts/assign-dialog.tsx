"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Trash2, UserPlus } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";
import {
  ApiError,
  assignShift,
  deleteAssignment,
  listAssignments,
  type Shift,
  type ShiftAssignment,
} from "@/lib/shifts";
import { cn } from "@/lib/utils";

const ASSIGN_PERIODS = [
  { value: "ongoing", label: "Ongoing" },
  { value: "d7", label: "1 week" },
  { value: "d14", label: "2 weeks" },
  { value: "d21", label: "3 weeks" },
  { value: "m1", label: "1 month" },
  { value: "m2", label: "2 months" },
  { value: "m3", label: "3 months" },
  { value: "custom", label: "Custom end date" },
];

/** Inclusive end date for a block starting at `from`. */
function endOfPeriod(from: string, period: string) {
  if (!from) return null;
  const d = new Date(`${from}T00:00:00`);

  if (period.startsWith("d")) {
    d.setDate(d.getDate() + Number(period.slice(1)) - 1);
  } else {
    // Clamp to the target month's length: 31 Jan + 1 month must not spill
    // through a non-existent 31 Feb into March.
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + Number(period.slice(1)));
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    d.setDate(d.getDate() - 1);
  }

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function AssignDialog({
  shift,
  defaultFrom,
  onClose,
  onChanged,
}: {
  shift: Shift | null;
  defaultFrom: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  // `defaultFrom` is computed by the parent in a click handler: calling
  // new Date() during render would block the static prerender.
  const [from, setFrom] = useState("");
  const effectiveFrom = from || defaultFrom;
  // How long this block of the rotation runs. "ongoing" leaves it open-ended.
  const [period, setPeriod] = useState("ongoing");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    if (!shift) return;
    let alive = true;

    listEmployees({ page_size: 100 })
      .then((p) => alive && setEmployees(p.items))
      .catch(() => alive && setEmployees([]));

    listAssignments(shift.id)
      .then((a) => alive && setAssignments(a))
      .catch(() => alive && setAssignments([]));

    return () => {
      alive = false;
    };
  }, [shift]);

  const assignedIds = useMemo(
    () =>
      new Set(
        (assignments ?? [])
          .filter((a) => !a.effective_to)
          .map((a) => a.employee_id),
      ),
    [assignments],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(term) ||
        e.employee_code.toLowerCase().includes(term),
    );
  }, [employees, query]);

  const effectiveTo =
    period === "ongoing"
      ? null
      : period === "custom"
        ? until || null
        : endOfPeriod(effectiveFrom, period);

  async function onAssign() {
    if (!shift || selected.length === 0) return;
    if (period === "custom" && !until) {
      toast.error("Pick an end date");
      return;
    }
    setSaving(true);
    try {
      await assignShift({
        employee_ids: selected,
        shift_id: shift.id,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      });
      setAssignments(await listAssignments(shift.id));
      setSelected([]);
      onChanged();
      toast.success(
        `Assigned ${selected.length} employee${selected.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not assign");
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(assignment: ShiftAssignment) {
    setRemoving(assignment.id);
    try {
      await deleteAssignment(assignment.id);
      setAssignments((prev) => (prev ?? []).filter((a) => a.id !== assignment.id));
      onChanged();
      toast.success("Assignment removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Dialog open={!!shift} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/60 p-5">
          <DialogTitle>Assign to {shift?.name}</DialogTitle>
          <DialogDescription>
            Assigning replaces any shift the employee is already on from this
            date onwards. Past attendance keeps its original shift.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Effective from</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Runs for</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGN_PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {period === "custom" && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Until</Label>
                <Input
                  type="date"
                  min={effectiveFrom}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </div>
            )}
          </div>

          <p className="-mt-1 text-xs text-muted-foreground">
            {effectiveTo ? (
              <>
                This block runs{" "}
                <span className="font-semibold text-foreground">
                  {effectiveFrom} → {effectiveTo}
                </span>
                . Assign the next shift from the following day to build the
                rotation.
              </>
            ) : (
              <>
                Open-ended — runs until another shift is assigned.
              </>
            )}
          </p>

          <div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employees"
                className="pl-9"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No employees found.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {filtered.map((e) => {
                    const checked = selected.includes(e.id);
                    const already = assignedIds.has(e.id);
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setSelected((prev) =>
                              checked
                                ? prev.filter((i) => i !== e.id)
                                : [...prev, e.id],
                            )
                          }
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                            checked ? "bg-primary/10" : "hover:bg-accent/50",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-brand-ink bg-brand-ink text-white"
                                : "border-border",
                            )}
                          >
                            {checked && <Check className="size-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {e.full_name}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {e.employee_code}
                            </span>
                          </span>
                          {already && (
                            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-brand-ink">
                              On this shift
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Current assignments
            </p>
            {assignments === null ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : assignments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nobody is on this shift yet.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {a.employee_name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {a.effective_from}
                        {a.effective_to ? ` → ${a.effective_to}` : " → ongoing"}
                      </span>
                    </span>
                    <IconButton
                      label="Remove assignment"
                      icon={Trash2}
                      variant="destructive"
                      disabled={removing === a.id}
                      onClick={() => onRemove(a)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 p-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            onClick={onAssign}
            disabled={saving || selected.length === 0}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            Assign {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
