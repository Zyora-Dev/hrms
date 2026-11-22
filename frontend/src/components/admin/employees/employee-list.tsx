"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  deleteEmployee,
  initials,
  labelOf,
  listEmployees,
  statusTone,
  type EmployeeListItem,
} from "./shared";
import { listLookups, type Lookup } from "@/lib/lookups";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

export function EmployeeList() {
  const router = useRouter();

  const [items, setItems] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [department, setDepartment] = useState("all");
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce typing so each keystroke doesn't hit the API. Bail out when the
  // query already matches what was fetched — otherwise the timer still fires
  // on mount, flips `loading` back on and never schedules a request to turn
  // it off, leaving the table stuck on skeletons.
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

  // State is only written from async callbacks here, never synchronously
  // in the effect body, which would cascade renders.
  useEffect(() => {
    let active = true;

    listEmployees({
      q: search || undefined,
      status,
      department_id: department === "all" ? undefined : Number(department),
      page,
      page_size: PAGE_SIZE,
    })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setTotal(data.total);
        setPages(data.pages);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(
          err instanceof ApiError ? err.message : "Could not load employees",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [search, status, department, page, reloadKey]);

  function refresh() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    listLookups("departments")
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  async function onDelete(employee: EmployeeListItem) {
    if (
      !window.confirm(
        `Delete ${employee.full_name} (${employee.employee_code})? This also removes their photo and documents, and cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(employee.id);
    try {
      await deleteEmployee(employee.id);
      toast.success(`${employee.full_name} deleted`);
      if (items.length === 1 && page > 1) setPage((p) => p - 1);
      else refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete employee");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code or email"
            aria-label="Search employees"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20"
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
          <SelectTrigger size="sm" className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {EMPLOYEE_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={department}
          onValueChange={(v) => {
            setDepartment(v);
            setPage(1);
            setLoading(true);
          }}
        >
          <SelectTrigger size="sm" className="h-9 w-[170px]">
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

        <Button asChild className="ml-auto">
          <Link href="/admin/employees/new">
            <Plus className="size-4" />
            Add employee
          </Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Employee</TableHead>
                <TableHead className="hidden md:table-cell">Code</TableHead>
                <TableHead className="hidden lg:table-cell">Designation</TableHead>
                <TableHead className="hidden sm:table-cell">Department</TableHead>
                <TableHead className="hidden xl:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[132px] pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`s-${i}`}>
                    <TableCell colSpan={7} className="pl-5">
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Users className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">No employees found</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {search || status !== "all" || department !== "all"
                            ? "Try clearing the filters."
                            : "Add your first employee to get started."}
                        </p>
                      </div>
                      <Button asChild size="sm">
                        <Link href="/admin/employees/new">
                          <Plus className="size-4" />
                          Add employee
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                items.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/employees/${emp.id}`)}
                  >
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {emp.photo_url && (
                            <AvatarImage src={emp.photo_url} alt={emp.full_name} />
                          )}
                          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-brand-ink">
                            {initials(emp.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {emp.full_name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {emp.work_email}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs font-semibold md:table-cell">
                      {emp.employee_code}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {emp.designation ?? "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {emp.department ?? "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {labelOf(EMPLOYMENT_TYPES, emp.employment_type)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                          statusTone(emp.status),
                        )}
                      >
                        {labelOf(EMPLOYEE_STATUSES, emp.status)}
                      </span>
                    </TableCell>
                    <TableCell
                      className="pr-5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <IconButton
                          label="View profile"
                          icon={Eye}
                          variant="neutral"
                          onClick={() => router.push(`/admin/employees/${emp.id}`)}
                        />
                        <IconButton
                          label="Edit employee"
                          icon={Pencil}
                          variant="brand"
                          onClick={() =>
                            router.push(`/admin/employees/${emp.id}/edit`)
                          }
                        />
                        <IconButton
                          label="Delete employee"
                          icon={Trash2}
                          variant="destructive"
                          disabled={deleting === emp.id}
                          onClick={() => onDelete(emp)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
