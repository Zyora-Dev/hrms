"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, History, Search } from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Badge } from "@/components/ui/badge";
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
  ApiError,
  getAssignmentHistory,
  hhmm,
  listShifts,
  shiftTone,
  type AssignmentHistoryItem,
  type Shift,
} from "@/lib/shifts";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

export function AssignmentHistory() {
  const [items, setItems] = useState<AssignmentHistoryItem[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [shiftId, setShiftId] = useState("all");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, []);

  useEffect(() => {
    let alive = true;

    getAssignmentHistory({
      shift_id: shiftId === "all" ? undefined : Number(shiftId),
      current_only: currentOnly,
      date_from: from || undefined,
      date_to: to || undefined,
      q: search || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setTotal(data.total);
        setPages(data.pages);
      })
      .catch((err) => {
        if (!alive) return;
        toast.error(err instanceof ApiError ? err.message : "Could not load history");
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [shiftId, currentOnly, from, to, search, page]);

  const order = shifts.map((s) => s.id);
  // A rotation is planned ahead, so a row that is not current may still be in
  // the future — labelling everything else "Past" would be wrong.
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
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
            setPage(1);
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

        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
            setLoading(true);
          }}
          className="w-[150px]"
          aria-label="Overlapping from"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
            setLoading(true);
          }}
          className="w-[150px]"
          aria-label="Overlapping to"
        />

        <Button
          type="button"
          variant={currentOnly ? "default" : "outline"}
          onClick={() => {
            setCurrentOnly((v) => !v);
            setPage(1);
            setLoading(true);
          }}
        >
          Current only
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Employee</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="pr-5">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`s-${i}`}>
                    <TableCell colSpan={5} className="pl-5">
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <History className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          No assignments found
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Every shift change an employee has had will show here.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                items.map((row) => {
                  const shift = shifts.find((s) => s.id === row.shift_id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="pl-5">
                        <span className="block truncate text-sm font-semibold">
                          {row.employee_name}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {row.employee_code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex h-5 items-center rounded px-1.5 font-mono text-[11px] font-semibold",
                              shiftTone(row.shift_id, order),
                            )}
                          >
                            {row.shift_code}
                          </span>
                          <span className="text-sm">
                            {row.shift_name}
                            {shift && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {hhmm(shift.start_time)}–{hhmm(shift.end_time)}
                              </span>
                            )}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm font-medium">
                        {row.effective_from}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {row.effective_to ?? (
                          <span className="text-muted-foreground">ongoing</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-5">
                        {row.is_current ? (
                          <Badge className="bg-primary/15 font-semibold text-primary hover:bg-primary/15">
                            Current
                          </Badge>
                        ) : row.effective_from > todayIso ? (
                          <Badge className="bg-sky-500/15 font-semibold text-sky-700 hover:bg-sky-500/15">
                            Upcoming
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Past
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <IconButton
                label="Previous page"
                icon={ChevronLeft}
                variant="neutral"
                disabled={page <= 1 || loading}
                onClick={() => {
                  setLoading(true);
                  setPage((p) => Math.max(1, p - 1));
                }}
              />
              <span className="text-xs font-semibold">
                {page} / {pages}
              </span>
              <IconButton
                label="Next page"
                icon={ChevronRight}
                variant="neutral"
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
    </div>
  );
}
