"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ApiError,
  getRoster,
  hhmm,
  listShifts,
  shiftTone,
  type Roster,
  type Shift,
} from "@/lib/shifts";
import { listLookups, type Lookup } from "@/lib/lookups";
import { cn } from "@/lib/utils";

/** Monday of the week containing `d`. */
function weekStart(d: Date) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function shiftDays(value: string, days: number) {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

/** A roster block can be any length, so offer a spread and a custom range. */
const SPANS = [
  { value: "d7", label: "1 week" },
  { value: "d14", label: "2 weeks" },
  { value: "d21", label: "3 weeks" },
  { value: "m1", label: "1 month" },
  { value: "m2", label: "2 months" },
  { value: "m3", label: "3 months" },
  { value: "custom", label: "Custom range" },
];

/** End date for a span starting at `from`, inclusive. */
function endFor(from: string, span: string) {
  if (span.startsWith("d")) return shiftDays(from, Number(span.slice(1)) - 1);
  return addMonths(from, Number(span.slice(1)));
}

/**
 * `from` plus n months, minus a day. The day is clamped to the target month's
 * length first — otherwise 31 Jan + 1 month overflows Feb 31 into March.
 */
function addMonths(from: string, months: number) {
  const d = new Date(`${from}T00:00:00`);
  const day = d.getDate();

  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  d.setDate(d.getDate() - 1);

  return iso(d);
}

function spanDays(from: string, to: string) {
  return (
    Math.round(
      (new Date(`${to}T00:00:00`).getTime() -
        new Date(`${from}T00:00:00`).getTime()) /
        86_400_000,
    ) + 1
  );
}

export function RosterChart() {
  // Empty until mount: new Date() during render blocks the static prerender.
  const [from, setFrom] = useState("");
  const [span, setSpan] = useState("d14");
  const [to, setTo] = useState("");
  const [shiftId, setShiftId] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const [roster, setRoster] = useState<Roster | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [loading, setLoading] = useState(true);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setFrom(iso(weekStart(new Date())));
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === search) return;
    debounce.current = setTimeout(() => {
      setSearch(trimmed);
      setLoading(true);
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, search]);

  useEffect(() => {
    listShifts(true).then(setShifts).catch(() => setShifts([]));
    listLookups("departments").then(setDepartments).catch(() => setDepartments([]));
  }, []);

  const dateTo = span === "custom" ? to : from ? endFor(from, span) : "";

  useEffect(() => {
    if (!from || !dateTo) return;
    let alive = true;

    getRoster({
      date_from: from,
      date_to: dateTo,
      shift_id: shiftId === "all" ? undefined : Number(shiftId),
      department_id: departmentId === "all" ? undefined : Number(departmentId),
      q: search || undefined,
    })
      .then((data) => alive && setRoster(data))
      .catch((err) => {
        if (!alive) return;
        toast.error(err instanceof ApiError ? err.message : "Could not load roster");
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [from, dateTo, shiftId, departmentId, search]);

  const order = useMemo(() => shifts.map((s) => s.id), [shifts]);
  const byId = useMemo(
    () => new Map(shifts.map((s) => [s.id, s])),
    [shifts],
  );

  // Step by exactly the period on screen, whatever its length.
  function move(direction: -1 | 1) {
    if (!from || !dateTo) return;
    const length = spanDays(from, dateTo);
    setLoading(true);
    const nextFrom = shiftDays(from, direction * length);
    setFrom(nextFrom);
    if (span === "custom") setTo(shiftDays(dateTo, direction * length));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconButton
            label="Previous period"
            icon={ChevronLeft}
            variant="neutral"
            disabled={!from || loading}
            onClick={() => move(-1)}
          />
          <IconButton
            label="Next period"
            icon={ChevronRight}
            variant="neutral"
            disabled={!from || loading}
            onClick={() => move(1)}
          />
        </div>

        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setLoading(true);
          }}
          className="w-[150px]"
          aria-label="Chart start date"
        />

        <Select
          value={span}
          onValueChange={(v) => {
            // Seed the custom end date from whatever is on screen.
            if (v === "custom") setTo(dateTo || from);
            setSpan(v);
            setLoading(true);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPANS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {span === "custom" && (
          <>
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value);
                setLoading(true);
              }}
              className="w-[150px]"
              aria-label="Chart end date"
            />
          </>
        )}

        <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee"
            className="pl-9"
          />
        </div>

        <Select
          value={shiftId}
          onValueChange={(v) => {
            setShiftId(v);
            setLoading(true);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All shifts</SelectItem>
            {shifts.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={departmentId}
          onValueChange={(v) => {
            setDepartmentId(v);
            setLoading(true);
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLoading(true);
            const start = iso(weekStart(new Date()));
            setFrom(start);
            if (span === "custom") setTo(shiftDays(start, 13));
          }}
        >
          Today
        </Button>
      </div>

      {/* legend */}
      {shifts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {shifts.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded px-1.5 font-mono text-[11px] font-semibold",
                  shiftTone(s.id, order),
                )}
              >
                {s.code}
              </span>
              <span className="text-muted-foreground">
                {s.name} · {hhmm(s.start_time)}–{hhmm(s.end_time)}
              </span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
              WO
            </span>
            <span className="text-muted-foreground">Weekly off</span>
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        {loading || !roster ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : roster.employees.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CalendarRange className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Nobody on the chart</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Assign a shift to employees to see the rotation here.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="sticky left-0 z-10 min-w-[190px] bg-card px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    Employee
                  </th>
                  {roster.dates.map((d) => {
                    const day = new Date(`${d}T00:00:00`);
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <th
                        key={d}
                        className={cn(
                          "min-w-[54px] px-1 py-2 text-center text-[11px] font-semibold",
                          weekend ? "bg-muted/50" : "",
                        )}
                      >
                        <span className="block text-muted-foreground">
                          {day.toLocaleDateString("en-GB", { weekday: "short" })}
                        </span>
                        <span className="block text-foreground">
                          {String(day.getDate()).padStart(2, "0")}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {roster.employees.map((e) => (
                  <tr
                    key={e.employee_id}
                    className="border-b border-border/60 last:border-0 hover:bg-accent/30"
                  >
                    <td className="sticky left-0 z-10 bg-card px-4 py-2">
                      <span className="block truncate text-sm font-semibold">
                        {e.employee_name}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {e.employee_code}
                        {e.department ? ` · ${e.department}` : ""}
                      </span>
                    </td>

                    {roster.dates.map((d) => {
                      const shiftIdForDay = e.days[d];
                      const off = e.offs.includes(d);
                      const shift = shiftIdForDay ? byId.get(shiftIdForDay) : null;

                      return (
                        <td key={d} className="px-1 py-1.5 text-center">
                          {shiftIdForDay == null ? (
                            <span className="text-xs text-muted-foreground/50">
                              —
                            </span>
                          ) : off ? (
                            <span className="inline-flex h-6 w-full items-center justify-center rounded bg-muted text-[11px] font-semibold text-muted-foreground">
                              WO
                            </span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "inline-flex h-6 w-full cursor-default items-center justify-center rounded font-mono text-[11px] font-semibold",
                                    shiftTone(shiftIdForDay, order),
                                  )}
                                >
                                  {shift?.code ?? "?"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {shift
                                  ? `${shift.name} · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}${shift.is_overnight ? " (next day)" : ""}`
                                  : "Shift"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {roster && roster.employees.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {roster.total} employee{roster.total === 1 ? "" : "s"} ·{" "}
          {roster.date_from} to {roster.date_to} ·{" "}
          {spanDays(roster.date_from, roster.date_to)} days
        </p>
      )}
    </div>
  );
}
