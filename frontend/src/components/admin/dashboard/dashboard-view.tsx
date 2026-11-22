"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CakeSlice,
  CalendarCheck,
  CalendarOff,
  CircleDollarSign,
  Clock,
  PartyPopper,
  RefreshCw,
  Timer,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { loadDashboard, type Dashboard } from "@/lib/dashboard";
import { monthLabel, rupees } from "@/lib/payroll";
import { cn } from "@/lib/utils";

/* Fixed labels so nothing here depends on the current date at render. */
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

function weekdayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function clock(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function relativeDays(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

export function DashboardView() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // First load runs straight off the effect; the button reuses `refresh`,
  // which also drives the spinner.
  useEffect(() => {
    let alive = true;
    loadDashboard()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((err) => {
        if (alive) setError(err?.message ?? "Could not load dashboard");
      });
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await loadDashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard");
    } finally {
      setRefreshing(false);
    }
  }, []);

  if (error && !data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-semibold text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  const { attendance, headcount, payroll } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-foreground/80">
            {weekdayLabel(data.today)}, {dayLabel(data.today)} ·{" "}
            {headcount.active} active {headcount.active === 1 ? "employee" : "employees"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={refresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {data.without_salary > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-relaxed text-foreground">
            <span className="font-semibold">
              {data.without_salary}{" "}
              {data.without_salary === 1 ? "employee has" : "employees have"} no
              annual CTC recorded.
            </span>{" "}
            They will be paid nothing on the next run until a salary is set.{" "}
            <Link href="/admin/employees" className="font-semibold underline">
              Fix now
            </Link>
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Active employees"
          accent="indigo"
          value={String(headcount.active)}
          foot={
            headcount.joined_this_month || headcount.exits_this_month ? (
              <>
                <Delta up value={`+${headcount.joined_this_month}`} /> joined
                {headcount.exits_this_month > 0 && (
                  <>
                    , <Delta up={false} value={`-${headcount.exits_this_month}`} />{" "}
                    left
                  </>
                )}{" "}
                this month
              </>
            ) : (
              "No change this month"
            )
          }
          href="/admin/employees"
        />
        <StatCard
          icon={CalendarCheck}
          label="Present today"
          accent="emerald"
          value={String(attendance.present + attendance.half_day)}
          foot={
            attendance.expected > 0 ? (
              <>
                <span className="font-semibold text-foreground">
                  {attendance.rate}%
                </span>{" "}
                of {attendance.expected} expected
              </>
            ) : (
              "Nobody rostered today"
            )
          }
          href="/admin/attendance"
        />
        <StatCard
          icon={CalendarOff}
          label="On leave today"
          accent="amber"
          value={String(attendance.on_leave)}
          foot={
            data.leave.pending_count > 0 ? (
              <>
                <span className="font-semibold text-amber-600">
                  {data.leave.pending_count}
                </span>{" "}
                awaiting approval
              </>
            ) : (
              "Nothing awaiting approval"
            )
          }
          href="/admin/leave"
        />
        <StatCard
          icon={CircleDollarSign}
          label={payroll.period ? `Payroll — ${monthLabel(payroll.period)}` : "Payroll"}
          accent="violet"
          value={payroll.period ? rupees(payroll.total_net, 0) : "—"}
          foot={
            payroll.period ? (
              <>
                {payroll.change_pct !== null && (
                  <>
                    <Delta
                      up={payroll.change_pct >= 0}
                      value={`${payroll.change_pct > 0 ? "+" : ""}${payroll.change_pct}%`}
                    />{" "}
                  </>
                )}
                <span className="capitalize">{payroll.status}</span> ·{" "}
                {payroll.employee_count} paid
              </>
            ) : (
              "No pay run yet"
            )
          }
          href="/admin/payroll"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <TodayBreakdown data={data} />
        <TrendChart data={data} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <PendingLeavePanel data={data} />
        <div className="space-y-6">
          <ShiftCoveragePanel data={data} />
          <DepartmentPanel data={data} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <PunchFeed data={data} />
        <HolidayPanel data={data} />
        <PeoplePanel data={data} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** One accent per card, so the four read as a set rather than a row of boxes. */
const ACCENTS = {
  indigo: {
    glow: "bg-indigo-500/20",
    chip: "from-indigo-500 to-indigo-600 shadow-indigo-500/25",
    hover: "hover:ring-indigo-500/25",
  },
  emerald: {
    glow: "bg-emerald-500/20",
    chip: "from-emerald-500 to-emerald-600 shadow-emerald-500/25",
    hover: "hover:ring-emerald-500/25",
  },
  amber: {
    glow: "bg-amber-500/25",
    chip: "from-amber-500 to-amber-600 shadow-amber-500/25",
    hover: "hover:ring-amber-500/25",
  },
  violet: {
    glow: "bg-violet-500/20",
    chip: "from-violet-500 to-violet-600 shadow-violet-500/25",
    hover: "hover:ring-violet-500/25",
  },
} as const;

/** A faint dot grid, drawn in CSS rather than shipped as an image. */
const DOTS = {
  backgroundImage:
    "radial-gradient(currentColor 1px, transparent 1px)",
  backgroundSize: "14px 14px",
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  foot,
  href,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  foot: React.ReactNode;
  href: string;
  accent: keyof typeof ACCENTS;
}) {
  const tone = ACCENTS[accent];

  return (
    <Link
      href={href}
      className={cn(
        "group relative isolate overflow-hidden rounded-xl bg-card px-3.5 py-3",
        "ring-1 ring-border/70 transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-foreground/[0.06]",
        tone.hover,
      )}
    >
      {/* A blurred bloom of the accent in one corner, and a dot grid under
          it. Both sit behind the content and neither touches the edges, so
          the card keeps its shape rather than wearing a stripe. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-10 -top-12 -z-10 size-32 rounded-full blur-2xl",
          "transition-transform duration-500 group-hover:scale-125",
          tone.glow,
        )}
      />
      <span
        aria-hidden
        style={DOTS}
        className="pointer-events-none absolute inset-0 -z-10 text-foreground/[0.07]"
      />

      {/* Everything sits beside the icon, in one column: three short lines
          instead of a stack that runs the height of the card. */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
            "bg-gradient-to-br text-white shadow-md transition-transform",
            "duration-200 group-hover:scale-105",
            tone.chip,
          )}
        >
          <Icon className="size-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-[22px] font-bold leading-none tabular-nums tracking-tight">
              {value}
            </span>
            <span className="truncate text-[12px] font-semibold text-foreground">
              {label}
            </span>
          </p>
          <p className="mt-1 truncate text-[11px] leading-tight text-foreground/75">
            {foot}
          </p>
        </div>

        <ArrowRight className="size-3.5 shrink-0 text-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

function Delta({ up, value }: { up: boolean; value: string }) {
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold",
        up ? "text-emerald-600" : "text-destructive",
      )}
    >
      <Icon className="size-3" />
      {value}
    </span>
  );
}

function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-xl border border-border/60 bg-card p-5", className)}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-foreground/75">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const SEGMENTS = [
  { key: "present", label: "Present", colour: "bg-chart-1" },
  { key: "half_day", label: "Half day", colour: "bg-chart-3" },
  { key: "on_leave", label: "On leave", colour: "bg-amber-500" },
  { key: "absent", label: "Absent", colour: "bg-destructive" },
  { key: "weekly_off", label: "Week off", colour: "bg-muted-foreground/40" },
  { key: "holiday", label: "Holiday", colour: "bg-chart-5" },
] as const;

function TodayBreakdown({ data }: { data: Dashboard }) {
  const a = data.attendance;
  const total =
    a.present + a.half_day + a.on_leave + a.absent + a.weekly_off + a.holiday;

  return (
    <Panel
      title="Today"
      description={`${a.rate}% attendance against ${a.expected} expected`}
      action={
        <Link
          href="/admin/attendance"
          className="text-xs font-semibold text-brand-ink hover:underline"
        >
          Register
        </Link>
      }
    >
      {total === 0 ? (
        <Empty text="No attendance computed for today yet." />
      ) : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {SEGMENTS.map((s) => {
              const value = a[s.key];
              if (!value) return null;
              return (
                <Tooltip key={s.key}>
                  <TooltipTrigger asChild>
                    <span
                      style={{ width: `${(value / total) * 100}%` }}
                      className={cn("h-full", s.colour)}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {s.label}: {value}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
            {SEGMENTS.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", s.colour)} />
                <span className="flex-1 truncate text-xs text-foreground/75">
                  {s.label}
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {a[s.key]}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border/50 pt-4">
            <Mini icon={Clock} label="Late in" value={String(a.late)} />
            <Mini
              icon={Timer}
              label="Overtime"
              value={a.overtime_hours ? `${a.overtime_hours}h` : "—"}
            />
            <Mini
              icon={AlertTriangle}
              label="Not marked"
              value={String(a.not_marked)}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

function Mini({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <span className="flex items-center gap-1.5 text-[11px] text-foreground/75">
        <Icon className="size-3" />
        {label}
      </span>
      <span className="mt-0.5 block text-sm font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function TrendChart({ data }: { data: Dashboard }) {
  const peak = Math.max(
    1,
    ...data.trend.map((d) => d.present + d.half_day + d.absent + d.on_leave),
  );
  const marked = data.trend.filter((d) => d.rate > 0);
  const average = marked.length
    ? Math.round(
        (marked.reduce((sum, d) => sum + d.rate, 0) / marked.length) * 10,
      ) / 10
    : 0;

  return (
    <Panel
      title="Attendance, last 14 days"
      description={marked.length ? `${average}% average on days worked` : undefined}
      action={
        <div className="flex items-center gap-3 text-[11px] text-foreground/75">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-1" /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500" /> Leave
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive" /> Absent
          </span>
        </div>
      }
    >
      {data.trend.every((d) => !d.present && !d.absent && !d.on_leave) ? (
        <Empty text="No attendance recorded in the last fortnight." />
      ) : (
        <div className="flex h-52 items-end gap-1.5">
          {data.trend.map((d) => {
            const stack = [
              { value: d.present, colour: "bg-chart-1" },
              { value: d.half_day, colour: "bg-chart-3" },
              { value: d.on_leave, colour: "bg-amber-500" },
              { value: d.absent, colour: "bg-destructive" },
            ];
            const total = stack.reduce((s, x) => s + x.value, 0);

            return (
              <Tooltip key={d.date}>
                <TooltipTrigger asChild>
                  <div className="flex h-full flex-1 cursor-default flex-col items-center gap-2">
                    <div className="flex w-full flex-1 flex-col justify-end gap-px">
                      {total === 0 ? (
                        <div className="h-1 w-full rounded-sm bg-muted" />
                      ) : (
                        stack.map(
                          (x, i) =>
                            x.value > 0 && (
                              <div
                                key={i}
                                style={{ height: `${(x.value / peak) * 100}%` }}
                                className={cn("w-full rounded-sm", x.colour)}
                              />
                            ),
                        )
                      )}
                    </div>
                    <span className="text-[10px] text-foreground/75">
                      {d.date.slice(8)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  <p className="font-semibold">
                    {weekdayLabel(d.date)} {dayLabel(d.date)}
                  </p>
                  <p>
                    {d.present} present · {d.half_day} half · {d.on_leave} leave ·{" "}
                    {d.absent} absent
                  </p>
                  {d.holiday > 0 && <p>{d.holiday} on holiday</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function PendingLeavePanel({ data }: { data: Dashboard }) {
  const rows = data.leave.pending;

  return (
    <Panel
      title="Leave awaiting approval"
      description={
        data.leave.pending_count
          ? `${data.leave.pending_count} pending`
          : undefined
      }
      action={
        <Link
          href="/admin/leave"
          className="text-xs font-semibold text-brand-ink hover:underline"
        >
          Open leave
        </Link>
      }
    >
      {rows.length === 0 ? (
        <Empty text="Nothing is waiting on you." />
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-brand-ink">
                {(r.employee_name ?? "?")
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {r.employee_name}
                  <span className="ml-1.5 font-mono text-[10px] font-normal text-foreground/75">
                    {r.employee_code}
                  </span>
                </p>
                <p className="truncate text-[11px] text-foreground/75">
                  {r.leave_type} · {dayLabel(r.start_date)}
                  {r.start_date !== r.end_date && ` – ${dayLabel(r.end_date)}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold tabular-nums">
                  {Number(r.days)} {Number(r.days) === 1 ? "day" : "days"}
                </p>
                <p
                  className={cn(
                    "text-[11px]",
                    r.starts_in_days <= 1
                      ? "font-semibold text-destructive"
                      : "text-foreground/75",
                  )}
                >
                  starts {relativeDays(r.starts_in_days)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ShiftCoveragePanel({ data }: { data: Dashboard }) {
  return (
    <Panel
      title="Shift coverage today"
      description="Rostered against actually present"
      action={
        <Link
          href="/admin/shifts"
          className="text-xs font-semibold text-brand-ink hover:underline"
        >
          Roster
        </Link>
      }
    >
      {data.shifts.length === 0 ? (
        <Empty text="No shifts are assigned for today." />
      ) : (
        <ul className="space-y-3.5">
          {data.shifts.map((s) => (
            <li key={s.shift_id}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-semibold">
                  {s.name}
                  <span className="ml-1.5 font-mono text-[10px] font-normal text-foreground/75">
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-foreground/75">
                  <span className="font-semibold text-foreground">
                    {s.present}
                  </span>
                  /{s.assigned}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  style={{ width: `${Math.min(s.pct, 100)}%` }}
                  className={cn(
                    "h-full rounded-full",
                    s.pct >= 80
                      ? "bg-chart-1"
                      : s.pct >= 50
                        ? "bg-amber-500"
                        : "bg-destructive",
                  )}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DepartmentPanel({ data }: { data: Dashboard }) {
  return (
    <Panel
      title="Headcount by department"
      description={`${data.headcount.active} active`}
    >
      {data.departments.length === 0 ? (
        <Empty text="No employees yet." />
      ) : (
        <ul className="space-y-3.5">
          {data.departments.map((d) => (
            <li key={d.name}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="truncate">{d.name}</span>
                <span className="shrink-0 tabular-nums text-foreground/75">
                  {d.count}
                  <span className="ml-1.5 opacity-60">{d.pct}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  style={{ width: `${d.pct}%` }}
                  className="h-full rounded-full bg-chart-1"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PunchFeed({ data }: { data: Dashboard }) {
  return (
    <Panel title="Latest punches" description="Today, newest first">
      {data.punches.length === 0 ? (
        <Empty text="No punches recorded today." />
      ) : (
        <ul className="space-y-2.5">
          {data.punches.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5">
              <span className="text-xs font-semibold tabular-nums text-brand-ink">
                {clock(p.punch_at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">
                {p.employee_name}
              </span>
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] capitalize"
              >
                {p.source}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function HolidayPanel({ data }: { data: Dashboard }) {
  return (
    <Panel
      title="Upcoming holidays"
      action={
        <Link
          href="/admin/attendance?tab=holidays"
          className="text-xs font-semibold text-brand-ink hover:underline"
        >
          Calendar
        </Link>
      }
    >
      {data.holidays.length === 0 ? (
        <Empty text="Nothing on the calendar." />
      ) : (
        <ul className="space-y-3">
          {data.holidays.map((h) => (
            <li key={`${h.name}-${h.holiday_date}`} className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 leading-none text-brand-ink">
                <span className="text-xs font-semibold">
                  {h.holiday_date.slice(8)}
                </span>
                <span className="text-[9px] uppercase">
                  {MONTHS_SHORT[Number(h.holiday_date.slice(5, 7)) - 1]}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{h.name}</p>
                <p className="text-[11px] capitalize text-foreground/75">
                  {h.kind} · {relativeDays(h.days_away)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PeoplePanel({ data }: { data: Dashboard }) {
  const hasCelebrations = data.celebrations.length > 0;

  return (
    <Panel
      title={hasCelebrations ? "People" : "Recent joiners"}
      description={hasCelebrations ? "Coming up and newly joined" : undefined}
    >
      {hasCelebrations && (
        <ul className="mb-4 space-y-2.5 border-b border-border/50 pb-4">
          {data.celebrations.map((c) => {
            const Icon = c.kind === "birthday" ? CakeSlice : PartyPopper;
            return (
              <li
                key={`${c.kind}-${c.employee_id}`}
                className="flex items-center gap-2.5"
              >
                <Icon className="size-3.5 shrink-0 text-brand-ink" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {c.name}
                </span>
                <span className="shrink-0 text-[11px] text-foreground/75">
                  {c.kind === "anniversary" && c.years
                    ? `${c.years} yr · `
                    : ""}
                  {dayLabel(c.on_date)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data.joiners.length === 0 ? (
        <Empty text="Nobody has joined yet." />
      ) : (
        <ul className="space-y-2.5">
          {data.joiners.map((j) => (
            <li key={j.id} className="flex items-center gap-2.5">
              <UserPlus className="size-3.5 shrink-0 text-foreground/75" />
              <Link
                href={`/admin/employees/${j.id}`}
                className="min-w-0 flex-1 truncate text-xs font-semibold hover:underline"
              >
                {j.name}
              </Link>
              <span className="shrink-0 text-[11px] text-foreground/75">
                {j.days_ago === 0 ? "today" : `${j.days_ago}d ago`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-foreground/75">
      {text}
    </p>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
