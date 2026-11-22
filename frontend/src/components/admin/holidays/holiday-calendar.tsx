"use client";

import { useEffect, useState } from "react";
import {
  CalendarHeart,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  HOLIDAY_KINDS,
  bulkHolidays,
  createHoliday,
  deleteHoliday,
  holidayTone,
  listHolidays,
  type Holiday,
} from "@/lib/holidays";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function HolidayCalendar() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<Holiday[] | null>(null);
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    listHolidays(year)
      .then(setRows)
      .catch(() => setRows([]));
  }, [year, reloadKey]);

  async function remove(h: Holiday) {
    if (!window.confirm(`Delete “${h.name}”?`)) return;
    try {
      await deleteHoliday(h.id);
      setReloadKey((k) => k + 1);
      toast.success("Deleted — recalculate attendance to apply");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  const byMonth = (rows ?? []).reduce<Record<number, Holiday[]>>((acc, h) => {
    const m = Number(h.holiday_date.split("-")[1]) - 1;
    (acc[m] ||= []).push(h);
    return acc;
  }, {});

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground">
          A holiday is paid and excluded from loss of pay. One falling on a
          weekly off earns nothing extra.
        </p>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setPaste(true)}
          >
            <Upload className="size-3.5" />
            Paste a list
          </Button>
          <Button size="sm" className="h-8" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" />
            Add holiday
          </Button>
        </div>
      </div>

      {rows === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <CalendarHeart className="size-4" />
          </span>
          <p className="text-sm font-semibold">No holidays for {year}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Without a calendar, festival days have no punches and are marked
            absent — which becomes loss of pay.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MONTHS.map((month, i) =>
            byMonth[i]?.length ? (
              <section
                key={month}
                className="overflow-hidden rounded-xl border border-border/60 bg-card"
              >
                <h3 className="border-b border-border/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {month}
                </h3>
                <ul className="divide-y divide-border/50">
                  {byMonth[i].map((h) => (
                    <li key={h.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                      <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/60">
                        <span className="text-xs font-semibold leading-none">
                          {h.holiday_date.split("-")[2]}
                        </span>
                        <span className="mt-0.5 text-[9px] uppercase text-muted-foreground">
                          {h.weekday.slice(0, 3)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          {h.name}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ring-1 ring-inset",
                              holidayTone(h.kind),
                            )}
                          >
                            {h.kind}
                          </span>
                          {h.location && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <MapPin className="size-2.5" />
                              {h.location}
                            </span>
                          )}
                          {!h.is_paid && (
                            <Badge variant="outline" className="text-[9px]">
                              Unpaid
                            </Badge>
                          )}
                        </span>
                      </span>
                      <IconButton
                        label="Delete holiday"
                        icon={Trash2}
                        variant="destructive"
                        size="sm"
                        onClick={() => remove(h)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      )}

      {open && (
        <AddDialog
          year={year}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {paste && (
        <PasteDialog
          year={year}
          onClose={() => setPaste(false)}
          onSaved={() => {
            setPaste(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function AddDialog({
  year,
  onClose,
  onSaved,
}: {
  year: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [day, setDay] = useState(`${year}-01-01`);
  const [kind, setKind] = useState("public");
  const [isPaid, setIsPaid] = useState(true);
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !day) {
      toast.error("Name and date are required");
      return;
    }
    setSaving(true);
    try {
      await createHoliday({
        name: name.trim(),
        holiday_date: day,
        kind: kind as Holiday["kind"],
        is_paid: isPaid,
        location: location.trim() || null,
      });
      toast.success("Added — recalculate attendance to apply");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a holiday</DialogTitle>
          <DialogDescription>
            Leave the location blank to apply it everywhere.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Diwali"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date *</Label>
              <Input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Type</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOLIDAY_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="All locations"
            />
            <p className="text-[11px] text-muted-foreground">
              Matched against the employee&apos;s work location.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="paid" checked={isPaid} onCheckedChange={setIsPaid} />
            <Label htmlFor="paid" className="text-sm font-normal">
              Paid holiday
            </Label>
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
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasteDialog({
  year,
  onClose,
  onSaved,
}: {
  year: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);

  // "2026-11-20, Diwali" — one per line.
  const parsed = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawDate, ...rest] = line.split(/[,\t]/);
      const d = (rawDate ?? "").trim();
      const name = rest.join(",").trim();
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(d) && name.length > 0;
      return { holiday_date: d, name, valid };
    });

  const good = parsed.filter((p) => p.valid);
  const bad = parsed.length - good.length;

  async function submit() {
    if (good.length === 0) {
      toast.error("Nothing valid to import");
      return;
    }
    setSaving(true);
    try {
      const r = await bulkHolidays(
        good.map((g) => ({
          name: g.name,
          holiday_date: g.holiday_date,
          kind: "public" as const,
          is_paid: true,
        })),
        replace ? year : undefined,
      );
      toast.success(
        `Added ${r.added}` +
          (r.skipped ? `, skipped ${r.skipped} already present` : "") +
          (r.removed ? `, replaced ${r.removed}` : ""),
      );
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paste a holiday list</DialogTitle>
          <DialogDescription>
            One per line: date then name, separated by a comma or tab.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"2027-01-26, Republic Day\n2027-03-14, Holi\n2027-08-15, Independence Day"}
            className="font-mono text-xs"
          />

          <p className="text-xs text-muted-foreground">
            {good.length} ready
            {bad > 0 && (
              <span className="text-destructive"> · {bad} line(s) unreadable</span>
            )}
          </p>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <Switch id="replace" checked={replace} onCheckedChange={setReplace} />
            <Label htmlFor="replace" className="text-xs font-normal leading-snug">
              Replace every holiday already in {year} first.
              <span className="block text-muted-foreground">
                Off adds to the list and skips duplicates.
              </span>
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !good.length}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Import {good.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
