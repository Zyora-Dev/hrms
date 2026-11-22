import {
  BadgeCheck,
  CalendarCheck,
  CircleDollarSign,
  Clock,
  FileText,
  Fingerprint,
  LineChart,
  Plane,
  ReceiptText,
  ShieldCheck,
  UserPlus,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

type Block = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  items: { icon: React.ElementType; label: string; desc: string }[];
};

const BLOCKS: Block[] = [
  {
    id: "platform",
    eyebrow: "Core HR",
    title: "One record per employee, from offer to exit",
    body: "Every document, role change, salary revision and approval lives on a single timeline — so nobody has to ask three people where the latest version is.",
    items: [
      {
        icon: Users,
        label: "Employee directory",
        desc: "Structured profiles, reporting lines and org chart.",
      },
      {
        icon: UserPlus,
        label: "Onboarding",
        desc: "Checklists that assign themselves on day one.",
      },
      {
        icon: FileText,
        label: "Documents",
        desc: "Contracts and letters with e-sign and expiry alerts.",
      },
      {
        icon: ShieldCheck,
        label: "Role-based access",
        desc: "Managers see their team. Nobody sees more.",
      },
    ],
  },
  {
    id: "payroll",
    eyebrow: "Payroll",
    title: "Run payroll in minutes, not in a spreadsheet",
    body: "Attendance, leave and reimbursements flow straight into the pay run. Compliance deductions are computed as you go and locked once approved.",
    items: [
      {
        icon: CircleDollarSign,
        label: "Automated pay runs",
        desc: "Salary, deductions and arrears in one cycle.",
      },
      {
        icon: BadgeCheck,
        label: "Statutory compliance",
        desc: "PF, ESI and TDS computed and filed on schedule.",
      },
      {
        icon: ReceiptText,
        label: "Payslips",
        desc: "Published to employees the moment the run closes.",
      },
      {
        icon: Plane,
        label: "Expenses",
        desc: "Claims approved and reimbursed in the same cycle.",
      },
    ],
  },
  {
    id: "attendance",
    eyebrow: "Time & attendance",
    title: "Accurate hours without anyone chasing timesheets",
    body: "Shifts, overtime, regularisation and leave balances stay in sync automatically, with an audit trail on every adjustment.",
    items: [
      {
        icon: Fingerprint,
        label: "Check-in anywhere",
        desc: "Web, mobile and biometric devices in one feed.",
      },
      {
        icon: Clock,
        label: "Shifts & overtime",
        desc: "Rosters, breaks and OT rules applied per policy.",
      },
      {
        icon: CalendarCheck,
        label: "Leave management",
        desc: "Accruals, holidays and carry-forward handled for you.",
      },
      {
        icon: LineChart,
        label: "Live reporting",
        desc: "Absence trends by team, location or month.",
      },
    ],
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="secondary" className="mb-4">
          The platform
        </Badge>
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything HR touches, in one place
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          Modules that share the same data, so a change in one is a change
          everywhere.
        </p>
      </div>

      <div className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
        {BLOCKS.map((block, i) => (
          <div
            key={block.id}
            id={block.id}
            className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16"
          >
            <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
                {block.eyebrow}
              </p>
              <h3 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                {block.title}
              </h3>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                {block.body}
              </p>
            </div>

            <div
              className={
                i % 2 === 1
                  ? "lg:order-1 grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2"
                  : "grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2"
              }
            >
              {block.items.map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="group bg-card p-5 transition-colors hover:bg-accent/40"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
                    <Icon className="size-4" />
                  </span>
                  <p className="mt-3.5 text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const AUTOMATIONS = [
  {
    icon: Workflow,
    title: "Approval chains",
    desc: "Route leave, expenses and revisions through the right managers, with escalation when someone sits on it.",
  },
  {
    icon: Zap,
    title: "Triggered actions",
    desc: "Confirmation letters on probation completion, reminders before document expiry, alerts on repeated absence.",
  },
  {
    icon: LineChart,
    title: "Scheduled reports",
    desc: "Headcount, attrition and payroll summaries delivered to finance on the day they need them.",
  },
];

export function Automations() {
  return (
    <section
      id="automations"
      className="relative scroll-mt-20 border-y border-border/60 bg-card/30"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_60%_at_50%_0%,var(--color-primary)_0%,transparent_70%)] opacity-[0.12]"
      />
      <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">
            Automations
          </Badge>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            The follow-ups run themselves
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            Define the rule once. The platform does the chasing, the filing and
            the reminding.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {AUTOMATIONS.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl border border-border/60 bg-card p-6 transition-colors hover:border-primary/40"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
                <Icon className="size-[18px]" />
              </span>
              <h3 className="mt-4 text-base font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
