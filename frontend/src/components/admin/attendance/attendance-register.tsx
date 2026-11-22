"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Fingerprint,
  Grid3x3,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AttendanceGrid } from "./attendance-grid";
import { ContinuationDialog } from "./continuation-dialog";
import { DayDialog } from "./day-dialog";
import { DayRosterTable } from "./day-roster-table";
import { ManualPunchDialog } from "./manual-punch-dialog";
import {
  ATTENDANCE_STATUSES,
  ApiError,
  clock,
  exportAttendance,
  getSummary,
  hours,
  importPunches,
  listAttendance,
  loadDayRoster,
  loadMatrix,
  recompute,
  shiftSpan,
  statusLabel,
  statusTone,
  today,
  type AttendanceDay,
  type AttendanceMatrix,
  type AttendanceSummary,
  type DayRoster,
  type DayRosterEntry,
} from "@/lib/attendance";
import { fetchAllDevices, listDevices } from "@/lib/devices";
import { listShifts, type Shift } from "@/lib/shifts";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

type View = "day" | "list" | "grid";

const VIEWS: { value: View; label: string; icon: React.ElementType }[] = [
  { value: "day", label: "Day", icon: CalendarDays },
  { value: "list", label: "Month list", icon: List },
  { value: "grid", label: "Month grid", icon: Grid3x3 },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Shift a YYYY-MM-DD by whole days without tripping over month ends. */
function shiftDay(iso: string, by: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const moved = new Date(y, m - 1, d + by);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}-${String(
    moved.getDate(),
  ).padStart(2, "0")}`;
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const moved = new Date(y, m - 1 + by, 1);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function prettyDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date(y, m - 1, d).getDay()
  ];
  return `${weekday}, ${d} ${MONTHS[m - 1]} ${y}`;
}

function prettyMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function AttendanceRegister() {
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(() => today().slice(0, 7));

  const [status, setStatus] = useState("all");
  const [shiftId, setShiftId] = useState("all");
  const [continuedOnly, setContinuedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<AttendanceDay[]>([]);
  const [roster, setRoster] = useState<DayRoster | null>(null);
  const [grid, setGrid] = useState<AttendanceMatrix | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [punchOpen, setPunchOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceDay | null>(null);
  const [opened, setOpened] = useState<DayRosterEntry | null>(null);
  const [hasDevices, setHasDevices] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The view picks the range; nothing else needs to know which one is on.
  const range = useMemo(
    () => (view === "day" ? { from: day, to: day } : monthRange(month)),
    [view, day, month],
  );

  const filters = useMemo(
    () => ({
      date_from: range.from,
      date_to: range.to,
      status,
      shift_id: shiftId === "all" ? undefined : Number(shiftId),
      continued_only: continuedOnly,
      q: search || undefined,
    }),
    [range, status, shiftId, continuedOnly, search],
  );

  // Only arm the timer for a real change, otherwise the mount tick would flip
  // `loading` on with no request pending to turn it back off.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === search) return;
    debounce.current = setTimeout(() => {
      setSearch(trimmed);
      setPage(1);
      setLoading(true);
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, search]);

  useEffect(() => {
    listShifts(true).then(setShifts).catch(() => setShifts([]));
    // The button only appears once a terminal is registered.
    listDevices()
      .then((rows) => setHasDevices(rows.some((d) => d.is_active)))
      .catch(() => setHasDevices(false));
  }, []);

  useEffect(() => {
    let alive = true;

    if (view === "grid") {
      loadMatrix({
        month,
        shift_id: shiftId === "all" ? undefined : Number(shiftId),
        q: search || undefined,
      })
        .then((m) => alive && setGrid(m))
        .catch((err) => {
          if (!alive) return;
          toast.error(err instanceof ApiError ? err.message : "Could not load");
        })
        .finally(() => alive && setLoading(false));
    } else if (view === "day") {
      // People, not computed rows — somebody who has not scanned yet still
      // needs a line to act on.
      loadDayRoster({
        on: day,
        shift_id: shiftId === "all" ? undefined : Number(shiftId),
        q: search || undefined,
      })
        .then((r) => alive && setRoster(r))
        .catch((err) => {
          if (!alive) return;
          toast.error(err instanceof ApiError ? err.message : "Could not load");
        })
        .finally(() => alive && setLoading(false));
    } else {
      listAttendance({ ...filters, page, page_size: PAGE_SIZE })
        .then((data) => {
          if (!alive) return;
          setRows(data.items);
          setPages(data.pages);
          setTotal(data.total);
        })
        .catch((err) => {
          if (!alive) return;
          toast.error(
            err instanceof ApiError ? err.message : "Could not load attendance",
          );
        })
        .finally(() => alive && setLoading(false));
    }

    getSummary(range.from, range.to)
      .then((s) => alive && setSummary(s))
      .catch(() => alive && setSummary(null));

    return () => {
      alive = false;
    };
  }, [view, day, month, filters, range, shiftId, search, page, reloadKey]);

  function refresh() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  function changeView(next: View) {
    if (next === view) return;

    // Keep the period aligned when swapping between day and month. The day
    // already on screen is kept whenever it belongs to the month being shown
    // — jumping to the 1st would land on a date with nothing on it.
    if (next === "day" && view !== "day" && !day.startsWith(`${month}-`)) {
      const now = today();
      setDay(now.startsWith(`${month}-`) ? now : `${month}-01`);
    }
    if (next !== "day" && view === "day") setMonth(day.slice(0, 7));

    setView(next);
    setPage(1);
    setLoading(true);
  }

  async function onRecompute() {
    setBusy(true);
    try {
      const r = await recompute({ date_from: range.from, date_to: range.to });
      toast.success(`Recalculated ${r.days} days for ${r.employees} employees`);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not recompute");
    } finally {
      setBusy(false);
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const r = await importPunches(file);
      toast.success(
        `Imported ${r.stored} of ${r.received} punches` +
          (r.duplicates ? ` · ${r.duplicates} already present` : ""),
      );
      if (r.unmatched.length) {
        toast.warning(`No employee matched: ${r.unmatched.join(", ")}`);
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFetchDevices() {
    setBusy(true);
    try {
      const results = await fetchAllDevices();
      const stored = results.reduce((sum, r) => sum + r.stored, 0);
      const unmatched = results.flatMap((r) => r.unmatched);
      toast.success(
        stored
          ? `${stored} punch${stored === 1 ? "" : "es"} pulled from the device`
          : "Nothing new on the device",
      );
      if (unmatched.length) {
        toast.warning(`No employee for user ${unmatched.join(", ")}`);
      }
      refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not reach the device",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    setBusy(true);
    try {
      await exportAttendance(filters);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* top bar: view switcher and the actions that act on the whole page */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-lg border border-border/70 bg-muted/40 p-0.5">
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => changeView(value)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                view === value
                  ? "bg-brand-ink font-semibold text-white shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onImport}
            className="hidden"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Import
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              CSV: employee_code, punch_at, direction
            </TooltipContent>
          </Tooltip>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={busy}
            onClick={onExport}
          >
            <Download className="size-3.5" />
            Export
          </Button>

          {hasDevices && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={busy}
              onClick={onFetchDevices}
            >
              <Fingerprint className="size-3.5" />
              Fetch from device
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={busy}
            onClick={onRecompute}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Recalculate
          </Button>

          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setPunchOpen(true)}
          >
            <Plus className="size-3.5" />
            Manual punch
          </Button>
        </div>
      </div>

      {/* period stepper */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconButton
            label={view === "day" ? "Previous day" : "Previous month"}
            icon={ChevronLeft}
            variant="neutral"
            size="sm"
            onClick={() => {
              setLoading(true);
              setPage(1);
              if (view === "day") setDay((d) => shiftDay(d, -1));
              else setMonth((m) => shiftMonth(m, -1));
            }}
          />
          <IconButton
            label={view === "day" ? "Next day" : "Next month"}
            icon={ChevronRight}
            variant="neutral"
            size="sm"
            onClick={() => {
              setLoading(true);
              setPage(1);
              if (view === "day") setDay((d) => shiftDay(d, 1));
              else setMonth((m) => shiftMonth(m, 1));
            }}
          />
        </div>

        {view === "day" ? (
          <>
            <Input
              type="date"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setPage(1);
                setLoading(true);
              }}
              className="h-8 w-[146px] text-xs"
              aria-label="Date"
            />
            <span className="text-xs font-semibold">{prettyDay(day)}</span>
          </>
        ) : (
          <>
            <Input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
                setLoading(true);
              }}
              className="h-8 w-[146px] text-xs"
              aria-label="Month"
            />
            <span className="text-xs font-semibold">{prettyMonth(month)}</span>
          </>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setLoading(true);
            setPage(1);
            setDay(today());
            setMonth(today().slice(0, 7));
          }}
        >
          Today
        </Button>
      </div>

      {/* summary tiles */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <Tile label="Present" value={summary?.present} tone="text-primary" />
        <Tile label="Half day" value={summary?.half_day} tone="text-amber-700" />
        <Tile label="Absent" value={summary?.absent} tone="text-destructive" />
        <Tile
          label="Continued shifts"
          value={summary?.continued}
          tone="text-brand-ink"
        />
        <Tile
          label="Overtime"
          value={summary ? hours(summary.total_overtime_minutes) : undefined}
          tone="text-brand-ink"
        />
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee"
            className="h-8 pl-8 text-xs"
          />
        </div>

        {view !== "grid" && (
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
              setLoading(true);
            }}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {ATTENDANCE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={shiftId}
          onValueChange={(v) => {
            setShiftId(v);
            setPage(1);
            setLoading(true);
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
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

        {view !== "grid" && (
          <Button
            type="button"
            size="sm"
            variant={continuedOnly ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => {
              setContinuedOnly((v) => !v);
              setPage(1);
              setLoading(true);
            }}
          >
            <ArrowRightLeft className="size-3.5" />
            Continued only
          </Button>
        )}
      </div>

      {view === "grid" ? (
        <AttendanceGrid
          data={grid}
          loading={loading}
          onPick={(employeeId, pickedDay) => {
            setDay(`${month}-${String(pickedDay).padStart(2, "0")}`);
            setQuery(
              grid?.rows.find((r) => r.employee_id === employeeId)
                ?.employee_code ?? "",
            );
            setView("day");
            setLoading(true);
          }}
        />
      ) : view === "day" ? (
        <DayRosterTable
          roster={roster}
          loading={loading}
          status={status}
          continuedOnly={continuedOnly}
          onOpen={setOpened}
          onContinuation={setEditing}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={`${TH} pl-4`}>Employee</TableHead>
                  <TableHead className={TH}>Date</TableHead>
                  <TableHead className={`${TH} hidden sm:table-cell`}>
                    Shift
                  </TableHead>
                  <TableHead className={TH}>In</TableHead>
                  <TableHead className={TH}>Out</TableHead>
                  <TableHead className={`${TH} hidden md:table-cell`}>
                    Worked
                  </TableHead>
                  <TableHead className={`${TH} hidden lg:table-cell`}>
                    Late
                  </TableHead>
                  <TableHead className={`${TH} hidden lg:table-cell`}>OT</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={`${TH} w-10 pr-4`} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`s-${i}`}>
                      <TableCell colSpan={10} className="pl-4">
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}

                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-14">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <CalendarClock className="size-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">
                            No attendance this month
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Assign a shift and import punches, or add one by hand.
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className={`${TD} pl-4`}>
                        <span className="block truncate text-xs font-semibold">
                          {row.employee_name}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {row.employee_code}
                        </span>
                      </TableCell>
                      <TableCell className={`${TD} whitespace-nowrap`}>
                        {row.attendance_date}
                      </TableCell>
                      <TableCell className={`${TD} hidden sm:table-cell`}>
                        {row.shift_name ?? "—"}
                      </TableCell>
                      <TableCell className={`${TD} whitespace-nowrap font-mono`}>
                        {clock(row.first_in, row.attendance_date)}
                      </TableCell>
                      <TableCell className={`${TD} whitespace-nowrap font-mono`}>
                        {clock(row.last_out, row.attendance_date)}
                      </TableCell>
                      <TableCell
                        className={`${TD} hidden font-semibold md:table-cell`}
                      >
                        {hours(row.worked_minutes)}
                      </TableCell>
                      <TableCell className={`${TD} hidden lg:table-cell`}>
                        {row.late_minutes ? (
                          <span className="text-amber-700">
                            {row.late_minutes}m
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className={`${TD} hidden lg:table-cell`}>
                        {row.overtime_minutes ? (
                          <span className="font-semibold text-brand-ink">
                            {hours(row.overtime_minutes)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className={TD}>
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                              statusTone(row.status),
                            )}
                          >
                            {statusLabel(row.status)}
                          </span>

                          {row.is_continued && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white",
                                    row.continuation_mode === "forced"
                                      ? "bg-brand-ink ring-1 ring-inset ring-white/30"
                                      : "bg-brand-ink",
                                  )}
                                >
                                  <ArrowRightLeft className="size-2.5" />
                                  {hours(row.continued_minutes)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                Continued {hours(row.continued_minutes)}
                                {shiftSpan(row.continued_shifts)
                                  ? ` — ${shiftSpan(row.continued_shifts)}`
                                  : ""}{" "}
                                past shift end
                                {row.continued_into_shift_name
                                  ? ` — into the ${row.continued_into_shift_name} shift`
                                  : ""}
                                {row.continuation_mode === "forced"
                                  ? " · marked by an admin"
                                  : " · from the punches"}
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {row.continuation_mode === "excluded" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                  <ArrowRightLeft className="size-2.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                A continuation here was dismissed
                                {row.continuation_note
                                  ? ` — ${row.continuation_note}`
                                  : ""}
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {row.has_manual_punch && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                  <Clock className="size-2.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                Includes a manually added punch
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`${TD} pr-4 text-right`}>
                        <IconButton
                          label="Continued shift"
                          icon={ArrowRightLeft}
                          size="sm"
                          variant={row.is_continued ? "brand" : "neutral"}
                          onClick={() => setEditing(row)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1.5">
                <IconButton
                  label="Previous page"
                  icon={ChevronLeft}
                  variant="neutral"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => Math.max(1, p - 1));
                  }}
                />
                <span className="text-[11px] font-semibold">
                  {page} / {pages}
                </span>
                <IconButton
                  label="Next page"
                  icon={ChevronRight}
                  variant="neutral"
                  size="sm"
                  disabled={page >= pages || loading}
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => Math.min(pages, p + 1));
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <ManualPunchDialog
        open={punchOpen}
        onClose={() => setPunchOpen(false)}
        onSaved={refresh}
      />

      {opened && (
        <DayDialog
          entry={opened}
          attendanceDate={day}
          onClose={() => setOpened(null)}
          onChanged={() => {
            setOpened(null);
            refresh();
          }}
        />
      )}

      {editing && (
        <ContinuationDialog
          day={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

const TH = "h-8 px-2 text-[10px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string | undefined;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-1.5 h-6 w-12" />
      ) : (
        <p className={cn("mt-0.5 text-xl font-semibold tracking-tight", tone)}>
          {value}
        </p>
      )}
    </div>
  );
}
