"use client";

import { ArrowRightLeft, CalendarClock, Clock } from "lucide-react";

import { IconButton } from "@/components/admin/icon-button";
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
import {
  clock,
  hours,
  shiftSpan,
  statusLabel,
  statusTone,
  type AttendanceDay,
  type DayRoster,
  type DayRosterEntry,
} from "@/lib/attendance";
import { cn } from "@/lib/utils";

const TH = "h-8 px-2 text-[10px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";

export function DayRosterTable({
  roster,
  loading,
  status,
  continuedOnly,
  onOpen,
  onContinuation,
}: {
  roster: DayRoster | null;
  loading: boolean;
  status: string;
  continuedOnly: boolean;
  onOpen: (entry: DayRosterEntry) => void;
  onContinuation: (day: AttendanceDay) => void;
}) {
  const entries = (roster?.entries ?? []).filter((e) => {
    if (status !== "all" && e.status !== status) return false;
    if (continuedOnly && !e.day?.is_continued) return false;
    return true;
  });

  const pending = (roster?.entries ?? []).filter(
    (e) => e.status === "not_marked",
  ).length;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      {roster && !roster.is_closed && (
        <p className="border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          The day is still running
          {pending > 0 && (
            <>
              {" "}
              — <span className="font-semibold text-foreground">
                {pending}
              </span>{" "}
              {pending === 1 ? "person has" : "people have"} nothing recorded
              yet
            </>
          )}
          . Nobody is called absent until their shift has ended.
        </p>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={`${TH} pl-4`}>Employee</TableHead>
              <TableHead className={`${TH} hidden sm:table-cell`}>Shift</TableHead>
              <TableHead className={TH}>In</TableHead>
              <TableHead className={TH}>Out</TableHead>
              <TableHead className={`${TH} hidden md:table-cell`}>Worked</TableHead>
              <TableHead className={`${TH} hidden lg:table-cell`}>Late</TableHead>
              <TableHead className={`${TH} hidden lg:table-cell`}>OT</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={`${TH} w-10 pr-4`} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={9} className="pl-4">
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!loading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-14">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <CalendarClock className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Nobody to show</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        No employee was on the books on this date, or the
                        filters rule everyone out.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              entries.map((entry) => {
                const day = entry.day;
                const open = entry.status === "not_marked";
                // Punched in, nothing concluded yet — say so rather than
                // leaving a bare dash on somebody who is at work.
                const working = open && !!day?.first_in && !day?.last_out;

                return (
                  <TableRow
                    key={entry.employee_id}
                    onClick={() => onOpen(entry)}
                    className="cursor-pointer"
                  >
                    <TableCell className={`${TD} pl-4`}>
                      <span className="block truncate text-xs font-semibold">
                        {entry.employee_name}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {entry.employee_code}
                      </span>
                    </TableCell>
                    <TableCell className={`${TD} hidden sm:table-cell`}>
                      {entry.shift_name ? (
                        <>
                          <span className="block truncate">{entry.shift_name}</span>
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {entry.shift_window}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className={`${TD} whitespace-nowrap font-mono`}>
                      {clock(day?.first_in ?? null, roster?.attendance_date)}
                    </TableCell>
                    <TableCell className={`${TD} whitespace-nowrap font-mono`}>
                      {clock(day?.last_out ?? null, roster?.attendance_date)}
                    </TableCell>
                    <TableCell className={`${TD} hidden font-semibold md:table-cell`}>
                      {day ? hours(day.worked_minutes) : "—"}
                    </TableCell>
                    <TableCell className={`${TD} hidden lg:table-cell`}>
                      {day?.late_minutes ? (
                        <span className="text-amber-700">{day.late_minutes}m</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className={`${TD} hidden lg:table-cell`}>
                      {day?.overtime_minutes ? (
                        <span className="font-semibold text-brand-ink">
                          {hours(day.overtime_minutes)}
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
                            working
                              ? "bg-primary/15 text-primary ring-primary/25"
                              : statusTone(entry.status),
                          )}
                        >
                          {working ? "In" : open ? "—" : statusLabel(entry.status)}
                        </span>

                        {entry.is_overridden && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] font-semibold text-brand-ink">
                                set
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">
                              Marked by hand
                              {day?.status_note ? ` — ${day.status_note}` : ""}
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {day?.is_continued && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                <ArrowRightLeft className="size-2.5" />
                                {hours(day.continued_minutes)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">
                              Continued {hours(day.continued_minutes)}
                              {shiftSpan(day.continued_shifts)
                                ? ` — ${shiftSpan(day.continued_shifts)}`
                                : ""}{" "}
                              past shift end
                              {day.continued_into_shift_name
                                ? ` — into the ${day.continued_into_shift_name} shift`
                                : ""}
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {day?.has_manual_punch && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
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
                    <TableCell
                      className={`${TD} pr-4 text-right`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {day && (
                        <IconButton
                          label="Continued shift"
                          icon={ArrowRightLeft}
                          size="sm"
                          variant={day.is_continued ? "brand" : "neutral"}
                          onClick={() => onContinuation(day)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
