"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  LEAVE_STATUSES,
  createLeaveRequest,
  decideLeaveRequest,
  getLeaveRequest,
  deleteLeaveRequest,
  leaveTone,
  listLeaveRequests,
  type LeaveRequest,
} from "@/lib/leave";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";
import { listLeaveTypes, type LeaveType } from "@/lib/payroll";
import { useLiveEvents } from "@/lib/live";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const TH = "h-9 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";

export function LeaveRequests() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set by a notification: open straight onto that one request.
  const focused = Number(searchParams.get("request")) || null;

  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [typeId, setTypeId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listEmployees({ page_size: 100 })
      .then((p) => setEmployees(p.items))
      .catch(() => setEmployees([]));
    listLeaveTypes().then(setTypes).catch(() => setTypes([]));
  }, []);

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
    let alive = true;
    listLeaveRequests({
      q: search || undefined,
      status,
      leave_type_id: typeId === "all" ? undefined : Number(typeId),
      date_from: from || undefined,
      date_to: to || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((d) => {
        if (!alive) return;
        setRows(d.items);
        setTotal(d.total);
        setPages(d.pages);
      })
      .catch((err) => {
        if (!alive) return;
        toast.error(err instanceof ApiError ? err.message : "Could not load requests");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [search, status, typeId, from, to, page, reloadKey]);

  function refresh() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  // An employee applying or withdrawing changes this list under the admin's
  // nose; reload rather than make them guess.
  useLiveEvents("admin", (event) => {
    if (event.kind === "leave_request") setReloadKey((k) => k + 1);
  });

  const focusedRow = focused ? rows.find((r) => r.id === focused) : undefined;

  function clearFocus() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("request");
    const query = next.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }

  async function decide(row: LeaveRequest, next: string) {
    setBusy(row.id);
    try {
      await decideLeaveRequest(row.id, next);
      toast.success(`Request ${next}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: LeaveRequest) {
    if (!window.confirm("Delete this leave request?")) return;
    try {
      await deleteLeaveRequest(row.id);
      toast.success("Request deleted");
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

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
            {LEAVE_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={typeId}
          onValueChange={(v) => {
            setTypeId(v);
            setPage(1);
            setLoading(true);
          }}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All leave types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
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
          className="h-8 w-[140px] text-xs"
          aria-label="From"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
            setLoading(true);
          }}
          className="h-8 w-[140px] text-xs"
          aria-label="To"
        />

        <Button size="sm" className="ml-auto h-8" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" />
          Apply leave
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} pl-4`}>Employee</TableHead>
                <TableHead className={TH}>Type</TableHead>
                <TableHead className={TH}>Dates</TableHead>
                <TableHead className={`${TH} text-right`}>Days</TableHead>
                <TableHead className={`${TH} hidden lg:table-cell`}>Reason</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={`${TH} w-[110px] pr-4 text-right`}>
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7} className="pl-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <CalendarOff className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">No leave requests</p>
                      <p className="text-xs text-muted-foreground">
                        Apply on behalf of an employee to get started.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                rows.map((r) => (
                  <TableRow key={r.id}>
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
                    <TableCell className={TD}>
                      {r.leave_type_name}
                      {!r.is_paid && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          (unpaid)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={`${TD} whitespace-nowrap`}>
                      {r.start_date}
                      {r.end_date !== r.start_date && ` → ${r.end_date}`}
                      {r.is_half_day && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          half
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={`${TD} text-right tabular-nums`}>
                      {r.days}
                    </TableCell>
                    <TableCell
                      className={`${TD} hidden max-w-[220px] truncate text-muted-foreground lg:table-cell`}
                    >
                      {r.reason || "—"}
                    </TableCell>
                    <TableCell className={TD}>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
                          leaveTone(r.status),
                        )}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className={`${TD} pr-4`}>
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "pending" && (
                          <>
                            <IconButton
                              label="Approve"
                              icon={busy === r.id ? Loader2 : Check}
                              variant="brand"
                              size="sm"
                              disabled={busy === r.id}
                              onClick={() => decide(r, "approved")}
                              className={busy === r.id ? "[&_svg]:animate-spin" : ""}
                            />
                            <IconButton
                              label="Reject"
                              icon={X}
                              variant="neutral"
                              size="sm"
                              disabled={busy === r.id}
                              onClick={() => decide(r, "rejected")}
                            />
                          </>
                        )}
                        {r.status === "approved" && (
                          <IconButton
                            label="Cancel leave"
                            icon={X}
                            variant="neutral"
                            size="sm"
                            onClick={() => decide(r, "cancelled")}
                          />
                        )}
                        <IconButton
                          label="Delete request"
                          icon={Trash2}
                          variant="destructive"
                          size="sm"
                          onClick={() => remove(r)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
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

      {focused && (
        <ReviewDialog
          requestId={focused}
          fallback={focusedRow}
          onClose={clearFocus}
          onDone={() => {
            clearFocus();
            refresh();
          }}
        />
      )}

      <ApplyDialog
        open={open}
        employees={employees}
        types={types}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function ReviewDialog({
  requestId,
  fallback,
  onClose,
  onDone,
}: {
  requestId: number;
  fallback?: LeaveRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [row, setRow] = useState<LeaveRequest | undefined>(fallback);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Fetched on its own rather than looked up in the table: the request a
    // notification points at may sit on another page, or behind a filter.
    getLeaveRequest(requestId)
      .then((r) => alive && setRow(r))
      .catch(() => {
        if (alive) toast.error("That request no longer exists");
      });
    return () => {
      alive = false;
    };
  }, [requestId]);

  async function decide(status: string) {
    setBusy(true);
    try {
      await decideLeaveRequest(requestId, status, note.trim() || undefined);
      toast.success(`Leave ${status}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row ? row.employee_name : "Leave request"}
          </DialogTitle>
          <DialogDescription>
            {row
              ? `${row.employee_code} · applied ${row.created_at.slice(0, 10)}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {!row ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 px-4 py-3">
              <div>
                <dt className="text-[11px] font-semibold text-foreground/70">
                  Leave type
                </dt>
                <dd className="text-sm font-semibold">{row.leave_type_name}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-foreground/70">
                  Days
                </dt>
                <dd className="text-sm font-semibold">
                  {row.days}
                  {row.is_half_day ? " (half day)" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-foreground/70">
                  Dates
                </dt>
                <dd className="text-sm font-semibold">
                  {row.start_date}
                  {row.end_date !== row.start_date && ` → ${row.end_date}`}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-foreground/70">
                  Status
                </dt>
                <dd>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
                      leaveTone(row.status),
                    )}
                  >
                    {row.status}
                  </span>
                </dd>
              </div>
            </dl>

            {row.reason && (
              <p className="text-xs">
                <span className="font-semibold">Reason: </span>
                {row.reason}
              </p>
            )}

            {row.status === "pending" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Note back to the employee
                </Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Approved — enjoy the break"
                  className="h-9"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {row?.status === "pending" && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => decide("rejected")}
              >
                <X className="size-4" />
                Reject
              </Button>
              <Button disabled={busy} onClick={() => decide("approved")}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyDialog({
  open,
  employees,
  types,
  onClose,
  onCreated,
}: {
  open: boolean;
  employees: EmployeeListItem[];
  types: LeaveType[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = types.find((t) => String(t.id) === typeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !typeId || !start) {
      toast.error("Employee, leave type and start date are required");
      return;
    }
    setSaving(true);
    try {
      const created = await createLeaveRequest({
        employee_id: Number(employeeId),
        leave_type_id: Number(typeId),
        start_date: start,
        end_date: half ? start : end || start,
        is_half_day: half,
        reason: reason.trim() || undefined,
      });
      toast.success(
        created.status === "approved"
          ? `${created.days} day(s) approved automatically`
          : `${created.days} day(s) submitted for approval`,
      );
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not apply");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply leave</DialogTitle>
          <DialogDescription>
            Weekly offs inside the range are not counted as leave.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.full_name} · {e.employee_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Leave type *</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {types
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} ({t.monthly_accrual}/month)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground">
                {selected.requires_approval
                  ? "Needs approval."
                  : "Approved automatically."}
                {Number(selected.min_notice_days) > 0 &&
                  ` ${selected.min_notice_days} day(s) notice required.`}
                {selected.max_consecutive_days &&
                  ` Max ${selected.max_consecutive_days} consecutive days.`}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">From *</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">To</Label>
              <Input
                type="date"
                value={half ? start : end}
                min={start}
                disabled={half}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          {selected?.allow_half_day && (
            <div className="flex items-center gap-2">
              <Switch id="half" checked={half} onCheckedChange={setHalf} />
              <Label htmlFor="half" className="text-sm font-normal">
                Half day
              </Label>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Reason</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
