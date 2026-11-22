"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Users } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
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
  ApiError,
  listLeaveBalances,
  type EmployeeLeaveBalances,
} from "@/lib/leave";
import { cn } from "@/lib/utils";

const TH = "h-9 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";

export function LeaveBalances() {
  const [rows, setRows] = useState<EmployeeLeaveBalances[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [asOf, setAsOf] = useState("");

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    let alive = true;
    listLeaveBalances({ q: search || undefined, as_of: asOf || undefined })
      .then((d) => alive && setRows(d))
      .catch((err) => {
        if (!alive) return;
        toast.error(err instanceof ApiError ? err.message : "Could not load balances");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [search, asOf]);

  // Column per leave type, taken from the first employee that has any.
  const codes = rows.find((r) => r.balances.length)?.balances.map((b) => b.code) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Employee name or code"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Input
          type="date"
          value={asOf}
          onChange={(e) => {
            setAsOf(e.target.value);
            setLoading(true);
          }}
          className="h-8 w-[150px] text-xs"
          aria-label="Balance as of"
        />
        <p className="ml-auto text-[11px] text-muted-foreground">
          Entitlement accrues monthly; pending requests are held back.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} pl-4`}>Employee</TableHead>
                {codes.map((c) => (
                  <TableHead key={c} className={`${TH} text-right`}>
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={codes.length + 1} className="pl-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={codes.length + 1} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Users className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">No employees</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                rows.map((r) => (
                  <TableRow key={r.employee_id}>
                    <TableCell className={`${TD} pl-4`}>
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-semibold">
                          {r.employee_name}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {r.employee_code}
                        </span>
                      </span>
                    </TableCell>
                    {codes.map((code) => {
                      const b = r.balances.find((x) => x.code === code);
                      if (!b)
                        return (
                          <TableCell
                            key={code}
                            className={`${TD} text-right text-muted-foreground/50`}
                          >
                            —
                          </TableCell>
                        );
                      const low = Number(b.available) <= 0;
                      return (
                        <TableCell key={code} className={`${TD} text-right`}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "cursor-default font-semibold tabular-nums",
                                  low && "text-destructive",
                                )}
                              >
                                {b.available}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              {b.name}: entitled {b.entitled}, used {b.used},
                              pending {b.pending}
                              {b.carry_forward
                                ? " · carries forward"
                                : b.encash_unused
                                  ? " · unused is paid out"
                                  : " · unused lapses"}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
