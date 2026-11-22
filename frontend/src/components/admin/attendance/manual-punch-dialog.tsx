"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";
import { ApiError, addManualPunch, today } from "@/lib/attendance";

export function ManualPunchDialog({
  open,
  onClose,
  onSaved,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  employeeId?: number;
}) {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [employee, setEmployee] = useState<string>(
    employeeId ? String(employeeId) : "",
  );
  const [day, setDay] = useState(today());
  const [at, setAt] = useState("09:00");
  const [direction, setDirection] = useState<"auto" | "in" | "out">("auto");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listEmployees({ page_size: 100 })
      .then((p) => setEmployees(p.items))
      .catch(() => setEmployees([]));
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) {
      toast.error("Pick an employee");
      return;
    }
    setSaving(true);
    try {
      // Sent without a zone offset; the server applies the org timezone.
      await addManualPunch({
        employee_id: Number(employee),
        punch_at: `${day}T${at}:00`,
        direction,
        note: note.trim() || undefined,
      });
      // The engine may touch neighbouring dates for a night shift; that is
      // housekeeping, not something to report back.
      toast.success(`Punch saved at ${at}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save punch");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add punch manually</DialogTitle>
          <DialogDescription>
            For missed scans or when the device is offline. The day is
            recalculated immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Employee *</Label>
            <Select value={employee} onValueChange={setEmployee}>
              <SelectTrigger className="w-full">
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Date *</Label>
              <Input
                required
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Time *</Label>
              <Input
                required
                type="time"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as typeof direction)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="in">In</SelectItem>
                  <SelectItem value="out">Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Reason</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Device offline / forgot to scan"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add punch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
