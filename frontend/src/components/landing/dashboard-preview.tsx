import {
  BarChart3,
  CalendarCheck,
  CircleDollarSign,
  LayoutGrid,
  Settings,
  Users,
} from "lucide-react";

const SIDEBAR = [
  { icon: LayoutGrid, label: "Overview", active: true },
  { icon: Users, label: "Employees" },
  { icon: CalendarCheck, label: "Attendance" },
  { icon: CircleDollarSign, label: "Payroll" },
  { icon: BarChart3, label: "Reports" },
  { icon: Settings, label: "Settings" },
];

const TILES = [
  { label: "Headcount", value: "248", delta: "+12 this month" },
  { label: "Present today", value: "94.2%", delta: "233 checked in" },
  { label: "Payroll — Nov", value: "₹62.4L", delta: "Approved" },
  { label: "Open requests", value: "7", delta: "3 need review" },
];

/** Monthly attendance %, Jan–Dec. */
const BARS = [68, 74, 71, 80, 86, 79, 88, 92, 85, 94, 90, 96];

const ACTIVITY = [
  { who: "Aarav Mehta", what: "submitted a leave request", when: "2m" },
  { who: "Payroll bot", what: "locked the November cycle", when: "1h" },
  { who: "Sana Qureshi", what: "completed onboarding", when: "3h" },
];

export function DashboardPreview() {
  return (
    <div className="relative mx-auto max-w-6xl">
      <div
        aria-hidden
        className="absolute -inset-x-8 -top-6 bottom-0 rounded-[2rem] bg-primary/10 blur-2xl"
      />
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-background/60 px-4 py-3">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <div className="mx-auto hidden rounded-md border border-border/60 bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground sm:block">
            app.hrms.io/overview
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr]">
          {/* sidebar */}
          <aside className="hidden border-r border-border/60 bg-background/40 p-3 sm:block">
            {SIDEBAR.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={
                  active
                    ? "mb-0.5 flex items-center gap-2.5 rounded-md bg-primary/15 px-2.5 py-2 text-xs font-medium text-primary"
                    : "mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground"
                }
              >
                <Icon className="size-3.5" />
                {label}
              </div>
            ))}
          </aside>

          {/* body */}
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {TILES.map((t) => (
                <div
                  key={t.label}
                  className="rounded-lg border border-border/60 bg-background/50 p-3"
                >
                  <p className="text-[11px] text-muted-foreground">{t.label}</p>
                  <p className="mt-1.5 text-xl font-semibold tracking-tight">
                    {t.value}
                  </p>
                  <p className="mt-0.5 text-[10px] text-primary">{t.delta}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
              <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                <p className="text-xs font-medium">Attendance rate</p>
                <p className="text-[11px] text-muted-foreground">
                  Last 12 months
                </p>
                <div className="mt-4 flex h-28 items-end gap-1.5">
                  {BARS.map((h, i) => (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className={
                        i === BARS.length - 1
                          ? "flex-1 rounded-sm bg-primary"
                          : "flex-1 rounded-sm bg-primary/25"
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                <p className="text-xs font-medium">Recent activity</p>
                <ul className="mt-3 space-y-3">
                  {ACTIVITY.map((a) => (
                    <li key={a.who} className="flex gap-2.5">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        <span className="text-foreground">{a.who}</span>{" "}
                        {a.what}
                        <span className="ml-1 opacity-60">· {a.when}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
