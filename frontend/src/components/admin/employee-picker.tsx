"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronsUpDown, Loader2, Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";
import { cn } from "@/lib/utils";

// The API caps page_size at 100; asking for more fails the whole request.
const PAGE_SIZE = 100;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Searchable employee selector. Filtering happens server-side, so it works
 *  for an organisation larger than one page of results. */
export function EmployeePicker({
  value,
  onChange,
  placeholder = "Search employees…",
  disabled,
  className,
}: {
  value: number | null;
  onChange: (employee: EmployeeListItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the chosen employee visible even if a later search excludes them.
  const [selected, setSelected] = useState<EmployeeListItem | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === search) return;
    debounce.current = setTimeout(() => setSearch(trimmed), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, search]);

  useEffect(() => {
    let alive = true;

    listEmployees({ q: search || undefined, page_size: PAGE_SIZE })
      .then((page) => {
        if (!alive) return;
        setItems(page.items);
        setTotal(page.total);
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        // Surfacing this matters: an empty dropdown with no message reads as
        // "there are no employees" rather than "the request failed".
        setItems([]);
        setError(err instanceof Error ? err.message : "Could not load employees");
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [search]);

  const shown = useMemo(() => {
    if (!selected || items.some((e) => e.id === selected.id)) return items;
    return [selected, ...items];
  }, [items, selected]);

  const current = selected ?? items.find((e) => e.id === value) ?? null;
  const more = total > items.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors",
            "focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20 focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error && "border-destructive/50",
            className,
          )}
        >
          {current ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar className="size-6">
                {current.photo_url && (
                  <AvatarImage src={current.photo_url} alt="" />
                )}
                <AvatarFallback className="bg-primary/15 text-[9px] font-semibold text-brand-ink">
                  {initials(current.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 text-left">
                <span className="block truncate font-medium leading-tight">
                  {current.full_name}
                </span>
                <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground">
                  {current.employee_code}
                </span>
              </span>
            </span>
          ) : (
            <span
              className={cn(
                "flex items-center gap-2",
                error ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : error ? (
                <AlertCircle className="size-4" />
              ) : (
                <Search className="size-4" />
              )}
              {loading ? "Loading…" : error ? error : placeholder}
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        id={listboxId}
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        {/* The server already filtered; cmdk must not filter again. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Name, code or department…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              <span className="block px-3 py-4 text-sm text-muted-foreground">
                {loading
                  ? "Searching…"
                  : error
                    ? error
                    : "No employee matches."}
              </span>
            </CommandEmpty>

            <CommandGroup>
              {shown.map((e) => (
                <CommandItem
                  key={e.id}
                  value={String(e.id)}
                  onSelect={() => {
                    const next = e.id === value ? null : e;
                    setSelected(next);
                    onChange(next);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      e.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <Avatar className="size-7">
                    {e.photo_url && <AvatarImage src={e.photo_url} alt="" />}
                    <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-brand-ink">
                      {initials(e.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {e.full_name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      <span className="font-mono">{e.employee_code}</span>
                      {e.designation ? ` · ${e.designation}` : ""}
                      {e.department ? ` · ${e.department}` : ""}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>

            {more && (
              <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                Showing {items.length} of {total} — type to narrow the search.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
