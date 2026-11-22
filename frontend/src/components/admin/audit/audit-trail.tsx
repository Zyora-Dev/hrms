"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
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
  ACTION_TONES,
  ApiError,
  auditFacets,
  exportAudit,
  listAudit,
  prettyEntity,
  prettyField,
  prettyValue,
  type AuditEntry,
  type AuditFacets,
} from "@/lib/audit";
import { daysAgo, today } from "@/lib/attendance";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const TH = "h-8 px-2 text-[10px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs align-top";

/**
 * Read the timestamp off the string rather than through `new Date()`: the
 * server already writes it in the organisation's timezone, and the Date
 * constructor counts as unstable while this page is being prerendered.
 */
function when(iso: string) {
  const [day, clock = ""] = iso.split("T");
  const [, month = "", date = ""] = day.split("-");
  return { date: `${date}/${month}`, time: clock.slice(0, 8) };
}

export function AuditTrail() {
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(today);
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [who, setWho] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [facets, setFacets] = useState<AuditFacets>({
    actions: [],
    entities: [],
    admins: [],
  });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters = useMemo(
    () => ({
      date_from: from,
      date_to: to,
      action,
      entity,
      admin_email: who,
      q: search || undefined,
    }),
    [from, to, action, entity, who, search],
  );

  useEffect(() => {
    auditFacets()
      .then(setFacets)
      .catch(() => {});
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
    listAudit({ ...filters, page, page_size: PAGE_SIZE })
      .then((data) => {
        if (!alive) return;
        setRows(data.items);
        setPages(data.pages);
        setTotal(data.total);
      })
      .catch((err) => {
        if (alive) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not load the trail",
          );
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filters, page]);

  function change(fn: () => void) {
    fn();
    setPage(1);
    setLoading(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          type="date"
          value={from}
          onChange={(e) => change(() => setFrom(e.target.value))}
          className="h-8 w-[146px] text-xs"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => change(() => setTo(e.target.value))}
          className="h-8 w-[146px] text-xs"
          aria-label="To date"
        />

        <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, record, path"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Picker
          value={action}
          onChange={(v) => change(() => setAction(v))}
          all="Any action"
          options={facets.actions}
          format={(v) => v.replace(/_/g, " ")}
          width="w-[130px]"
        />
        <Picker
          value={entity}
          onChange={(v) => change(() => setEntity(v))}
          all="Any record"
          options={facets.entities}
          format={prettyEntity}
          width="w-[160px]"
        />
        <Picker
          value={who}
          onChange={(v) => change(() => setWho(v))}
          all="Anyone"
          options={facets.admins}
          width="w-[180px]"
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-8 text-xs"
          onClick={() =>
            exportAudit(filters).catch(() => toast.error("Export failed"))
          }
        >
          <Download className="size-3.5" />
          Export
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} w-[90px] pl-4`}>When</TableHead>
                <TableHead className={`${TH} hidden sm:table-cell`}>Who</TableHead>
                <TableHead className={`${TH} w-[90px]`}>Action</TableHead>
                <TableHead className={TH}>Record</TableHead>
                <TableHead className={`${TH} pr-4`}>What happened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`s-${i}`}>
                    <TableCell colSpan={5} className="pl-4">
                      <Skeleton className="h-7 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <History className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">Nothing recorded</p>
                      <p className="text-xs text-muted-foreground">
                        Changes made from here on will appear in this list.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                rows.map((row) => {
                  const stamp = when(row.at);
                  const fields = Object.entries(row.changes ?? {});
                  const expanded = open === row.id;

                  return (
                    <TableRow
                      key={row.id}
                      className={cn(fields.length > 0 && "cursor-pointer")}
                      onClick={() =>
                        fields.length && setOpen(expanded ? null : row.id)
                      }
                    >
                      <TableCell className={`${TD} pl-4 whitespace-nowrap`}>
                        <span className="block font-semibold">{stamp.date}</span>
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {stamp.time}
                        </span>
                      </TableCell>
                      <TableCell className={`${TD} hidden sm:table-cell`}>
                        <span className="block truncate">
                          {row.admin_email ?? "system"}
                        </span>
                        {row.ip_address && (
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {row.ip_address}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={TD}>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ring-inset",
                            ACTION_TONES[row.action] ?? ACTION_TONES.action,
                          )}
                        >
                          {row.action.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                      <TableCell className={TD}>
                        <span className="block font-semibold">
                          {prettyEntity(row.entity)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {row.label ?? (row.entity_id ? `#${row.entity_id}` : "—")}
                        </span>
                      </TableCell>
                      <TableCell className={`${TD} pr-4`}>
                        <span className="block">{row.summary ?? "—"}</span>

                        {fields.length > 0 && !expanded && (
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {fields.length} field
                            {fields.length === 1 ? "" : "s"} · click to see them
                          </span>
                        )}

                        {expanded && (
                          <dl className="mt-2 space-y-1 border-l-2 border-primary/30 pl-3">
                            {fields.map(([field, change]) => (
                              <div
                                key={field}
                                className="flex flex-wrap items-baseline gap-x-2 text-[11px]"
                              >
                                <dt className="font-semibold capitalize">
                                  {prettyField(field)}
                                </dt>
                                <dd className="text-muted-foreground line-through decoration-destructive/40">
                                  {prettyValue(change?.from)}
                                </dd>
                                <span className="text-muted-foreground">→</span>
                                <dd className="font-semibold text-foreground">
                                  {prettyValue(change?.to)}
                                </dd>
                              </div>
                            ))}
                            {row.path && (
                              <p className="pt-1 font-mono text-[10px] text-muted-foreground">
                                {row.method} {row.path}
                              </p>
                            )}
                          </dl>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1.5">
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
    </div>
  );
}

function Picker({
  value,
  onChange,
  all,
  options,
  format,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  all: string;
  options: string[];
  format?: (v: string) => string;
  width: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 text-xs", width)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option} className="capitalize">
            {format ? format(option) : option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
