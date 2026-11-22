"use client";

import { useEffect, useId, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { Field } from "./fields";
import {
  ApiError,
  createLookup,
  listLookups,
  type Lookup,
  type LookupKind,
} from "@/lib/lookups";
import { cn } from "@/lib/utils";

/**
 * Select an existing department/designation or create one inline.
 * New entries are saved immediately so they're available everywhere.
 */
export function LookupCombobox({
  kind,
  label,
  value,
  onChange,
  error,
  placeholder = "Select or add…",
}: {
  kind: LookupKind;
  label: string;
  value: number | null;
  onChange: (id: number | null) => void;
  error?: string;
  placeholder?: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Lookup[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    listLookups(kind)
      .then((rows) => active && setOptions(rows))
      .catch(() => active && setOptions([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [kind]);

  const selected = options.find((o) => o.id === value) ?? null;
  const term = query.trim();
  const exactMatch = options.some(
    (o) => o.name.toLowerCase() === term.toLowerCase(),
  );

  async function onCreate() {
    if (!term || creating) return;
    setCreating(true);
    try {
      const created = await createLookup(kind, term);
      // Re-created an archived entry? Replace rather than duplicate it.
      setOptions((prev) =>
        [...prev.filter((o) => o.id !== created.id), created].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      onChange(created.id);
      setQuery("");
      setOpen(false);
      toast.success(`“${created.name}” added`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Field label={label} error={error}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-invalid={!!error}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors",
              "focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20 focus:outline-none",
              "aria-invalid:border-destructive",
            )}
          >
            <span
              className={cn(
                "truncate",
                selected ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {loading ? "Loading…" : (selected?.name ?? placeholder)}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          id={listboxId}
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command shouldFilter>
            <CommandInput
              placeholder={`Search or type a new ${label.toLowerCase()}…`}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {term ? (
                  <button
                    type="button"
                    onClick={onCreate}
                    disabled={creating}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm font-medium text-brand-ink hover:bg-accent"
                  >
                    {creating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Add “{term}”
                  </button>
                ) : (
                  <span className="block px-2 py-3 text-sm text-muted-foreground">
                    Nothing yet — type to add one.
                  </span>
                )}
              </CommandEmpty>

              <CommandGroup>
                {value !== null && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className="text-muted-foreground"
                  >
                    Clear selection
                  </CommandItem>
                )}

                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        option.id === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{option.name}</span>
                    {option.in_use > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {option.in_use}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>

              {/* Also offer creation while results are still showing. */}
              {term && !exactMatch && options.length > 0 && (
                <CommandGroup className="border-t border-border/60">
                  <CommandItem
                    value={`__create__${term}`}
                    onSelect={onCreate}
                    className="font-medium text-brand-ink"
                  >
                    <Plus className="size-4" />
                    Add “{term}”
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
