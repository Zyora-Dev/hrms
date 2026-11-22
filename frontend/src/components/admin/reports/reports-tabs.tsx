"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarOff,
  Download,
  HandCoins,
  Landmark,
  Loader2,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { daysAgo, hours, today } from "@/lib/attendance";
import { listLookups, type Lookup } from "@/lib/lookups";
import { monthLabel, rupees } from "@/lib/payroll";
import {
  ApiError,
  attendanceReport,
  downloadReport,
  headcountReport,
  leaveReport,
  outstandingReport,
  payrollReport,
  statutoryReport,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

const TABS = [
  "attendance",
  "payroll",
  "statutory",
  "leave",
  "headcount",
  "outstanding",
] as const;
const DEFAULT_TAB = TABS[0];

const TAB_LIST = cn(
  "w-full justify-start gap-1 overflow-x-auto rounded-lg border border-border/70",
  "bg-muted/40 p-1 group-data-horizontal/tabs:h-auto",
);

const TAB = cn(
  "group h-7 flex-none gap-1.5 rounded-md px-2.5 text-xs font-medium",
  "text-foreground/80 transition-colors",
  "hover:bg-background hover:text-foreground",
  "data-active:bg-brand-ink data-active:font-semibold data-active:text-white",
  "data-active:shadow-sm data-active:hover:bg-brand-ink data-active:hover:text-white",
  "[&_svg]:size-3.5",
);

// Readable rather than decorative: plain case, no letter spacing, and dark
// enough to carry weight against the rows below.
const TH = "px-2 py-2 text-xs font-bold text-foreground";
const TD = "px-2 py-1.5 text-xs";
const NUM = `${TD} text-right tabular-nums`;

export function ReportsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const tab = TABS.includes(requested as (typeof TABS)[number])
    ? (requested as string)
    : DEFAULT_TAB;

  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [department, setDepartment] = useState("all");

  useEffect(() => {
    listLookups("departments")
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TAB) next.delete("tab");
    else next.set("tab", value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const picker = (
    <Select value={department} onValueChange={setDepartment}>
      <SelectTrigger className="h-8 w-[170px] text-xs">
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
  );

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-5">
      <TabsList className={TAB_LIST}>
        <TabsTrigger value="attendance" className={TAB}>
          <CalendarCheck className="size-3.5" />
          Attendance
        </TabsTrigger>
        <TabsTrigger value="payroll" className={TAB}>
          <Wallet className="size-3.5" />
          Payroll
        </TabsTrigger>
        <TabsTrigger value="statutory" className={TAB}>
          <Landmark className="size-3.5" />
          Statutory
        </TabsTrigger>
        <TabsTrigger value="leave" className={TAB}>
          <CalendarOff className="size-3.5" />
          Leave
        </TabsTrigger>
        <TabsTrigger value="headcount" className={TAB}>
          <Users className="size-3.5" />
          Headcount
        </TabsTrigger>
        <TabsTrigger value="outstanding" className={TAB}>
          <HandCoins className="size-3.5" />
          Loans &amp; advances
        </TabsTrigger>
      </TabsList>

      <TabsContent value="attendance">
        <AttendancePanel department={department} picker={picker} />
      </TabsContent>
      <TabsContent value="payroll">
        <PayrollPanel department={department} picker={picker} />
      </TabsContent>
      <TabsContent value="statutory">
        <StatutoryPanel department={department} picker={picker} />
      </TabsContent>
      <TabsContent value="leave">
        <LeavePanel department={department} picker={picker} />
      </TabsContent>
      <TabsContent value="headcount">
        <HeadcountPanel department={department} picker={picker} />
      </TabsContent>
      <TabsContent value="outstanding">
        <OutstandingPanel department={department} picker={picker} />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Loads a report whenever its filters change. The result is kept with the
 * filters that produced it, so "loading" is simply the answer not matching
 * the question yet — no state written from inside the effect.
 */
function useReport<T>(load: () => Promise<T>, filters: Record<string, unknown>) {
  const key = JSON.stringify(filters);
  const run = useRef(load);

  // Kept current after each render rather than during it, so the fetch below
  // can depend on the filters alone.
  useEffect(() => {
    run.current = load;
  });

  const [state, setState] = useState<{ key: string; data: T | null }>({
    key: "",
    data: null,
  });

  useEffect(() => {
    let alive = true;
    run
      .current()
      .then((data) => alive && setState({ key, data }))
      .catch(() => alive && setState({ key, data: null }));
    return () => {
      alive = false;
    };
  }, [key]);

  return {
    data: state.key === key ? state.data : null,
    loading: state.key !== key,
  };
}

function Shell({
  children,
  bar,
  onExport,
  loading,
  empty,
  rows,
}: {
  children: React.ReactNode;
  bar: React.ReactNode;
  onExport: () => void;
  loading: boolean;
  empty: string;
  rows: number;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onExport();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {bar}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-8 text-xs"
          disabled={busy || rows === 0}
          onClick={run}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          Export CSV
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : rows === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card py-16">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <BarChart3 className="size-3.5" />
            </span>
            <p className="text-sm font-semibold">Nothing to report</p>
            <p className="text-xs text-foreground/80">{empty}</p>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Totals({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-border/60 bg-card px-3 py-2.5"
        >
          <p className="text-[11px] font-semibold text-foreground/70">{label}</p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight">{value}</p>
        </div>
      ))}
    </div>
  );
}

function Grid({
  head,
  children,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border/60">
            <tr>{head}</tr>
          </thead>
          <tbody className="divide-y divide-border/50">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function Who({
  code,
  name,
  sub,
}: {
  code: string | null;
  name: string | null;
  sub?: string | null;
}) {
  return (
    <td className={`${TD} pl-4`}>
      <span className="block truncate font-semibold">{name}</span>
      <span className="block truncate font-mono text-[10px] font-medium text-foreground/70">
        {code}
        {sub ? ` · ${sub}` : ""}
      </span>
    </td>
  );
}

/* ------------------------------------------------------------------ */

function AttendancePanel({
  department,
  picker,
}: {
  department: string;
  picker: React.ReactNode;
}) {
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState("");
  const params = useCallback(
    () => ({
      date_from: from,
      date_to: to,
      department_id: department,
      q: query.trim() || undefined,
    }),
    [from, to, department, query],
  );

  const { data, loading } = useReport(() => attendanceReport(params()), params());

  const rows = data?.rows ?? [];

  return (
    <Shell
      loading={loading}
      rows={rows.length}
      empty="No attendance was computed in this range."
      onExport={() => downloadReport("attendance", params())}
      bar={
        <>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[146px] text-xs"
          />
          <span className="text-xs font-medium text-foreground">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[146px] text-xs"
          />
          {picker}
          <div className="relative w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Employee"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <Totals
          items={[
            ["Employees", String(data?.employees ?? 0)],
            ["Present days", String(data?.present ?? 0)],
            ["Absent days", String(data?.absent ?? 0)],
            ["Overtime", hours(data?.overtime_minutes ?? 0)],
          ]}
        />
        <Grid
          head={
            <>
              <th className={`${TH} pl-4 text-left`}>Employee</th>
              <th className={`${TH} text-right`}>P</th>
              <th className={`${TH} text-right`}>H</th>
              <th className={`${TH} text-right`}>A</th>
              <th className={`${TH} text-right`}>L</th>
              <th className={`${TH} text-right`}>W/O</th>
              <th className={`${TH} text-right`}>Payable</th>
              <th className={`${TH} text-right`}>Worked</th>
              <th className={`${TH} text-right`}>OT</th>
              <th className={`${TH} pr-4 text-right`}>Late</th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.employee_id}>
              <Who code={r.employee_code} name={r.employee_name} sub={r.department} />
              <td className={NUM}>{r.present}</td>
              <td className={NUM}>{r.half_day}</td>
              <td className={cn(NUM, r.absent > 0 && "text-destructive")}>
                {r.absent}
              </td>
              <td className={NUM}>{r.on_leave}</td>
              <td className={NUM}>{r.weekly_off + r.holiday}</td>
              <td className={`${NUM} font-semibold`}>{Number(r.payable_days)}</td>
              <td className={NUM}>{hours(r.worked_minutes)}</td>
              <td className={cn(NUM, r.overtime_minutes > 0 && "text-brand-ink")}>
                {hours(r.overtime_minutes)}
              </td>
              <td className={`${NUM} pr-4`}>{r.late_days || "—"}</td>
            </tr>
          ))}
        </Grid>
      </div>
    </Shell>
  );
}

function PayrollPanel({
  department,
  picker,
}: {
  department: string;
  picker: React.ReactNode;
}) {
  const [from, setFrom] = useState(() => `${today().slice(0, 4)}-01`);
  const [to, setTo] = useState(() => today().slice(0, 7));
  const params = useCallback(
    () => ({
      date_from: `${from}-01`,
      date_to: `${to}-01`,
      department_id: department,
    }),
    [from, to, department],
  );

  const { data, loading } = useReport(() => payrollReport(params()), params());

  const rows = data?.rows ?? [];

  return (
    <Shell
      loading={loading}
      rows={rows.length}
      empty="No pay run falls in this range."
      onExport={() => downloadReport("payroll", params())}
      bar={
        <>
          <Input
            type="month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[146px] text-xs"
          />
          <span className="text-xs font-medium text-foreground">to</span>
          <Input
            type="month"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[146px] text-xs"
          />
          {picker}
        </>
      }
    >
      <div className="space-y-4">
        <Totals
          items={[
            ["Gross", rupees(data?.gross ?? 0, 0)],
            ["Deductions", rupees(data?.deductions ?? 0, 0)],
            ["Net paid", rupees(data?.net ?? 0, 0)],
            ["Cost to company", rupees(data?.employer_cost ?? 0, 0)],
          ]}
        />
        <Grid
          head={
            <>
              <th className={`${TH} pl-4 text-left`}>Month</th>
              <th className={`${TH} text-right`}>Staff</th>
              <th className={`${TH} text-right`}>Gross</th>
              <th className={`${TH} text-right`}>Deductions</th>
              <th className={`${TH} text-right`}>Net</th>
              <th className={`${TH} text-right`}>PF</th>
              <th className={`${TH} text-right`}>ESI</th>
              <th className={`${TH} text-right`}>PT</th>
              <th className={`${TH} pr-4 text-right`}>TDS</th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.period}>
              <td className={`${TD} pl-4`}>
                <span className="block font-semibold">{monthLabel(r.period)}</span>
                <span className="block text-[10px] font-medium capitalize text-foreground/70">
                  {r.status}
                </span>
              </td>
              <td className={NUM}>{r.employees}</td>
              <td className={NUM}>{rupees(r.gross, 0)}</td>
              <td className={NUM}>{rupees(r.deductions, 0)}</td>
              <td className={`${NUM} font-semibold`}>{rupees(r.net, 0)}</td>
              <td className={NUM}>{rupees(r.pf, 0)}</td>
              <td className={NUM}>{rupees(r.esi, 0)}</td>
              <td className={NUM}>{rupees(r.pt, 0)}</td>
              <td className={`${NUM} pr-4`}>{rupees(r.tds, 0)}</td>
            </tr>
          ))}
        </Grid>
      </div>
    </Shell>
  );
}

function StatutoryPanel({
  department,
  picker,
}: {
  department: string;
  picker: React.ReactNode;
}) {
  const [period, setPeriod] = useState(() => today().slice(0, 7));
  const params = useCallback(
    () => ({ period: `${period}-01`, department_id: department }),
    [period, department],
  );

  const { data, loading } = useReport(() => statutoryReport(params()), params());

  const rows = data?.rows ?? [];

  return (
    <Shell
      loading={loading}
      rows={rows.length}
      empty="No pay run for this month, so there is nothing to file."
      onExport={() => downloadReport("statutory", params())}
      bar={
        <>
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-8 w-[146px] text-xs"
          />
          {picker}
        </>
      }
    >
      <div className="space-y-4">
        <Totals
          items={[
            ["PF (both sides)", rupees(data?.pf_total ?? 0, 0)],
            ["ESI (both sides)", rupees(data?.esi_total ?? 0, 0)],
            ["Professional tax", rupees(data?.pt_total ?? 0, 0)],
            ["TDS", rupees(data?.tds_total ?? 0, 0)],
          ]}
        />
        <Grid
          head={
            <>
              <th className={`${TH} pl-4 text-left`}>Employee</th>
              <th className={`${TH} text-left`}>UAN / ESIC / PAN</th>
              <th className={`${TH} text-right`}>Gross</th>
              <th className={`${TH} text-right`}>PF (emp)</th>
              <th className={`${TH} text-right`}>PF (co)</th>
              <th className={`${TH} text-right`}>ESI (emp)</th>
              <th className={`${TH} text-right`}>ESI (co)</th>
              <th className={`${TH} text-right`}>PT</th>
              <th className={`${TH} pr-4 text-right`}>TDS</th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.employee_id}>
              <Who code={r.employee_code} name={r.employee_name} />
              <td className={`${TD} font-mono text-[10px] text-foreground`}>
                {r.uan || "—"} / {r.esic_number || "—"} / {r.pan || "—"}
              </td>
              <td className={NUM}>{rupees(r.gross, 0)}</td>
              <td className={NUM}>{rupees(r.pf_employee, 0)}</td>
              <td className={NUM}>{rupees(r.pf_employer, 0)}</td>
              <td className={NUM}>{rupees(r.esi_employee, 0)}</td>
              <td className={NUM}>{rupees(r.esi_employer, 0)}</td>
              <td className={NUM}>{rupees(r.pt, 0)}</td>
              <td className={`${NUM} pr-4`}>{rupees(r.tds, 0)}</td>
            </tr>
          ))}
        </Grid>
      </div>
    </Shell>
  );
}

function LeavePanel({
  department,
  picker,
}: {
  department: string;
  picker: React.ReactNode;
}) {
  const [year, setYear] = useState(() => Number(today().slice(0, 4)));
  const [query, setQuery] = useState("");
  const params = useCallback(
    () => ({
      year,
      department_id: department,
      q: query.trim() || undefined,
    }),
    [year, department, query],
  );

  const { data, loading } = useReport(() => leaveReport(params()), params());

  const rows = data?.rows ?? [];

  return (
    <Shell
      loading={loading}
      rows={rows.length}
      empty="Nobody has taken or accrued leave this year."
      onExport={() => downloadReport("leave", params())}
      bar={
        <>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-8 w-[100px] text-xs"
          />
          {picker}
          <div className="relative w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Employee"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <Totals
          items={[
            ["Days taken", String(Number(data?.taken ?? 0))],
            ["Balance left", String(Number(data?.balance ?? 0))],
            ["Rows", String(rows.length)],
            ["Year", String(year)],
          ]}
        />
        <Grid
          head={
            <>
              <th className={`${TH} pl-4 text-left`}>Employee</th>
              <th className={`${TH} text-left`}>Leave type</th>
              <th className={`${TH} text-right`}>Taken</th>
              <th className={`${TH} text-right`}>Balance</th>
              <th className={`${TH} pr-4 text-right`}>Pending</th>
            </>
          }
        >
          {rows.map((r, i) => (
            <tr key={`${r.employee_id}-${r.leave_type}-${i}`}>
              <Who code={r.employee_code} name={r.employee_name} sub={r.department} />
              <td className={TD}>{r.leave_type}</td>
              <td className={NUM}>{Number(r.taken)}</td>
              <td className={`${NUM} font-semibold`}>{Number(r.balance)}</td>
              <td className={`${NUM} pr-4`}>
                {Number(r.pending) > 0 ? (
                  <span className="text-amber-700">{Number(r.pending)}</span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </Grid>
      </div>
    </Shell>
  );
}

function HeadcountPanel({
  department,
  picker,
}: {
  department: string;
  picker: React.ReactNode;
}) {
  const [from, setFrom] = useState(() => `${Number(today().slice(0, 4)) - 1}-01`);
  const [to, setTo] = useState(() => today().slice(0, 7));
  const params = useCallback(
    () => ({
      date_from: `${from}-01`,
      date_to: `${to}-01`,
      department_id: department,
    }),
    [from, to, department],
  );

  const { data, loading } = useReport(() => headcountReport(params()), params());

  const months = data?.months ?? [];
  const departments = Object.entries(data?.departments ?? {});

  return (
    <Shell
      loading={loading}
      rows={months.length}
      empty="No employee records fall in this range."
      onExport={() => downloadReport("headcount", params())}
      bar={
        <>
          <Input
            type="month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[146px] text-xs"
          />
          <span className="text-xs font-medium text-foreground">to</span>
          <Input
            type="month"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[146px] text-xs"
          />
          {picker}
        </>
      }
    >
      <div className="space-y-4">
        <Totals
          items={[
            ["Joined", String(data?.joined ?? 0)],
            ["Left", String(data?.left ?? 0)],
            ["On the books now", String(data?.closing ?? 0)],
            ["Departments", String(departments.length)],
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <Grid
            head={
              <>
                <th className={`${TH} pl-4 text-left`}>Month</th>
                <th className={`${TH} text-right`}>Opening</th>
                <th className={`${TH} text-right`}>Joined</th>
                <th className={`${TH} text-right`}>Left</th>
                <th className={`${TH} text-right`}>Closing</th>
                <th className={`${TH} pr-4 text-right`}>Attrition</th>
              </>
            }
          >
            {months.map((m) => (
              <tr key={m.period}>
                <td className={`${TD} pl-4 font-semibold`}>{monthLabel(m.period)}</td>
                <td className={NUM}>{m.opening}</td>
                <td className={cn(NUM, m.joined > 0 && "text-emerald-600")}>
                  {m.joined || "—"}
                </td>
                <td className={cn(NUM, m.left > 0 && "text-destructive")}>
                  {m.left || "—"}
                </td>
                <td className={`${NUM} font-semibold`}>{m.closing}</td>
                <td className={`${NUM} pr-4`}>
                  {m.attrition_percent ? `${m.attrition_percent}%` : "—"}
                </td>
              </tr>
            ))}
          </Grid>

          <section className="rounded-xl border border-border/60 bg-card p-4">
            <h3 className="text-xs font-bold text-foreground">
              Where they sit today
            </h3>
            <ul className="mt-3 space-y-3">
              {departments.map(([name, count]) => {
                const total = departments.reduce((s, [, c]) => s + c, 0) || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <li key={name}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="truncate">{name}</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {count}
                        <span className="ml-1.5 opacity-60">{pct}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full rounded-full bg-chart-1"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function OutstandingPanel({
  department,
  picker,
}: {
  department: string;
  picker: React.ReactNode;
}) {
  const params = useCallback(
    () => ({ department_id: department }),
    [department],
  );

  const { data, loading } = useReport(() => outstandingReport(params()), params());

  const rows = data?.rows ?? [];

  return (
    <Shell
      loading={loading}
      rows={rows.length}
      empty="Nothing is owed back right now."
      onExport={() => downloadReport("outstanding", params())}
      bar={picker}
    >
      <div className="space-y-4">
        <Totals
          items={[
            ["Loans outstanding", rupees(data?.loans ?? 0, 0)],
            ["Advances to recover", rupees(data?.advances ?? 0, 0)],
            [
              "Total",
              rupees(Number(data?.loans ?? 0) + Number(data?.advances ?? 0), 0),
            ],
            ["Open items", String(rows.length)],
          ]}
        />
        <Grid
          head={
            <>
              <th className={`${TH} pl-4 text-left`}>Employee</th>
              <th className={`${TH} text-left`}>Kind</th>
              <th className={`${TH} text-left`}>Reference</th>
              <th className={`${TH} text-right`}>Principal</th>
              <th className={`${TH} text-right`}>Recovered</th>
              <th className={`${TH} pr-4 text-right`}>Outstanding</th>
            </>
          }
        >
          {rows.map((r, i) => (
            <tr key={`${r.kind}-${r.reference}-${i}`}>
              <Who code={r.employee_code} name={r.employee_name} />
              <td className={TD}>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ring-inset",
                    r.kind === "loan"
                      ? "bg-primary/15 text-primary ring-primary/25"
                      : "bg-amber-500/15 text-amber-700 ring-amber-500/25",
                  )}
                >
                  {r.kind}
                </span>
              </td>
              <td className={`${TD} font-mono text-[11px]`}>{r.reference}</td>
              <td className={NUM}>{rupees(r.principal, 0)}</td>
              <td className={NUM}>{rupees(r.recovered, 0)}</td>
              <td className={`${NUM} pr-4 font-semibold`}>
                {rupees(r.outstanding, 0)}
              </td>
            </tr>
          ))}
        </Grid>
      </div>
    </Shell>
  );
}
