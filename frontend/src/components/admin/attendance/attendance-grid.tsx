"use client";

import { CalendarRange } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { hours, type AttendanceMatrix, type MatrixCell } from "@/lib/attendance";
import { cn } from "@/lib/utils";

/** One letter per day — the muster roll convention. */
const MARKS: Record<string, { letter: string; tone: string; label: string }> = {
  present: {
    letter: "P",
    tone: "bg-primary/15 text-primary",
    label: "Present",
  },
  half_day: {
    letter: "H",
    tone: "bg-amber-500/20 text-amber-700",
    label: "Half day",
  },
  absent: {
    letter: "A",
    tone: "bg-destructive/15 text-destructive",
    label: "Absent",
  },
  weekly_off: {
    letter: "W",
    tone: "bg-muted text-muted-foreground",
    label: "Weekly off",
  },
  holiday: {
    letter: "O",
    tone: "bg-sky-500/15 text-sky-700",
    label: "Holiday",
  },
  on_leave: {
    letter: "L",
    tone: "bg-violet-500/15 text-violet-700",
    label: "On leave",
  },
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function AttendanceGrid({
  data,
  loading,
  onPick,
}: {
  data: AttendanceMatrix | null;
  loading: boolean;
  onPick: (employeeId: number, day: number) => void;
}) {
  if (loading || !data) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <CalendarRange className="size-4" />
          </span>
          <p className="text-sm font-semibold">Nothing for this month</p>
          <p className="text-xs text-muted-foreground">
            Nobody was employed in this month, or no filter matched.
          </p>
        </div>
      </div>
    );
  }

  const [year, month] = data.month.split("-").map(Number);
  const days = Array.from({ length: data.days }, (_, i) => i + 1);
  const weekdayOf = (day: number) => new Date(year, month - 1, day).getDay();

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  Employee
                </th>
                {days.map((d) => {
                  const weekend = [0, 6].includes(weekdayOf(d));
                  return (
                    <th
                      key={d}
                      className={cn(
                        "w-7 px-0 py-1.5 text-center font-semibold",
                        weekend && "bg-muted/40",
                      )}
                    >
                      <span className="block text-[9px] leading-none text-muted-foreground">
                        {WEEKDAYS[weekdayOf(d)]}
                      </span>
                      <span className="block text-[10px] leading-tight tabular-nums">
                        {d}
                      </span>
                    </th>
                  );
                })}
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                  P
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                  A
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                  L
                </th>
                <th className="px-2 py-1.5 pr-3 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                  OT
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.employee_id} className="border-t border-border/50">
                  <td className="sticky left-0 z-10 max-w-[180px] border-t border-border/50 bg-card px-3 py-1.5">
                    <span className="block truncate text-xs font-semibold">
                      {row.employee_name}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {row.employee_code}
                    </span>
                  </td>

                  {row.cells.map((cell) => (
                    <Cell
                      key={cell.day}
                      cell={cell}
                      weekend={[0, 6].includes(weekdayOf(cell.day))}
                      onPick={() => onPick(row.employee_id, cell.day)}
                    />
                  ))}

                  <td className="px-2 text-right text-[11px] font-semibold tabular-nums text-primary">
                    {Number(row.present)}
                  </td>
                  <td className="px-2 text-right text-[11px] tabular-nums text-destructive">
                    {row.absent || "—"}
                  </td>
                  <td className="px-2 text-right text-[11px] tabular-nums text-violet-700">
                    {row.leave || "—"}
                  </td>
                  <td className="px-2 pr-3 text-right text-[11px] tabular-nums text-brand-ink">
                    {row.overtime_minutes ? hours(row.overtime_minutes) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        {Object.entries(MARKS).map(([key, m]) => (
          <span
            key={key}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded text-[9px] font-semibold",
                m.tone,
              )}
            >
              {m.letter}
            </span>
            {m.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-4 rounded bg-brand-ink" />
          Continued shift
        </span>
      </div>
    </div>
  );
}

function Cell({
  cell,
  weekend,
  onPick,
}: {
  cell: MatrixCell;
  weekend: boolean;
  onPick: () => void;
}) {
  const mark = cell.status ? MARKS[cell.status] : null;

  if (!mark) {
    return (
      <td className={cn("p-0.5 text-center", weekend && "bg-muted/40")}>
        <span className="mx-auto block size-5 rounded text-[10px] leading-5 text-muted-foreground/40">
          ·
        </span>
      </td>
    );
  }

  return (
    <td className={cn("p-0.5 text-center", weekend && "bg-muted/40")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onPick}
            className={cn(
              "relative mx-auto flex size-5 items-center justify-center rounded text-[10px] font-semibold transition-transform hover:scale-110",
              mark.tone,
            )}
          >
            {mark.letter}
            {cell.is_continued && (
              <span className="absolute -right-px -top-px size-1.5 rounded-full bg-brand-ink ring-1 ring-card" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <p className="font-semibold">
            {cell.day} · {mark.label}
            {cell.shift_code ? ` · ${cell.shift_code}` : ""}
          </p>
          <p>
            Worked {hours(cell.worked_minutes)}
            {cell.late_minutes ? ` · ${cell.late_minutes}m late` : ""}
            {cell.overtime_minutes
              ? ` · OT ${hours(cell.overtime_minutes)}`
              : ""}
          </p>
          {cell.is_continued && (
            <p className="text-brand-ink">
              Continued shift
              {cell.continuation_mode === "forced" ? " (marked by admin)" : ""}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}
