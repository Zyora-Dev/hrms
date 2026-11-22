import { CalendarCheck, CircleDollarSign, ShieldCheck } from "lucide-react";

const BARS = [52, 61, 58, 70, 66, 78, 74, 85, 81, 92, 88, 96];

export function LoginAside() {
  return (
    <aside className="relative hidden p-3 lg:block">
      {/* Asymmetric notch echoes the reference panel shape. */}
      <div className="relative h-full overflow-hidden rounded-[2.5rem_1rem_2.5rem_1rem] bg-gradient-to-br from-primary/90 via-primary/55 to-chart-4/40">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,oklch(1_0_0_/_0.08)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0_/_0.08)_1px,transparent_1px)] bg-[size:48px_48px]"
        />
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-80 rounded-full bg-white/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-20 size-96 rounded-full bg-background/40 blur-3xl"
        />

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
          <p className="max-w-sm text-balance text-2xl font-semibold leading-snug tracking-tight text-white xl:text-[1.75rem]">
            Manage people, payroll and attendance from a single console.
          </p>

          <div className="space-y-4">
            {/* headline metric card */}
            <div className="rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-white/70">Attendance rate</p>
                <p className="text-xs font-medium text-white/90">+4.2%</p>
              </div>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
                94.2%
              </p>
              <div className="mt-4 flex h-16 items-end gap-1.5">
                {BARS.map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className={
                      i === BARS.length - 1
                        ? "flex-1 rounded-sm bg-white"
                        : "flex-1 rounded-sm bg-white/30"
                    }
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MiniCard
                icon={CircleDollarSign}
                value="₹62.4L"
                label="Payroll run"
              />
              <MiniCard icon={CalendarCheck} value="248" label="Employees" />
              <MiniCard icon={ShieldCheck} value="100%" label="Compliant" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MiniCard({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
      <Icon className="size-4 text-white/80" />
      <p className="mt-2.5 text-base font-semibold tracking-tight text-white">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-white/65">{label}</p>
    </div>
  );
}
