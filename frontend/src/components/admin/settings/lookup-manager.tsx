"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  createLookup,
  deleteLookup,
  listLookups,
  updateLookup,
  type Lookup,
  type LookupKind,
} from "@/lib/lookups";

export function LookupManager({
  kind,
  title,
  description,
  placeholder,
}: {
  kind: LookupKind;
  title: string;
  description: string;
  placeholder: string;
}) {
  const [items, setItems] = useState<Lookup[] | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    // include_inactive so archived entries can be brought back.
    listLookups(kind, true)
      .then((rows) => active && setItems(rows))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [kind]);

  function sortByName(rows: Lookup[]) {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value || adding) return;

    setAdding(true);
    try {
      const created = await createLookup(kind, value);
      setItems((prev) =>
        sortByName([...(prev ?? []).filter((i) => i.id !== created.id), created]),
      );
      setName("");
      toast.success(`“${created.name}” added`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add");
    } finally {
      setAdding(false);
    }
  }

  async function onRename(item: Lookup) {
    const value = editValue.trim();
    if (!value) return;
    if (value === item.name) {
      setEditingId(null);
      return;
    }

    setBusyId(item.id);
    try {
      const saved = await updateLookup(kind, item.id, value, item.is_active);
      setItems((prev) =>
        sortByName((prev ?? []).map((i) => (i.id === saved.id ? saved : i))),
      );
      setEditingId(null);
      toast.success("Renamed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not rename");
    } finally {
      setBusyId(null);
    }
  }

  async function onToggle(item: Lookup, isActive: boolean) {
    setBusyId(item.id);
    try {
      const saved = await updateLookup(kind, item.id, item.name, isActive);
      setItems((prev) => (prev ?? []).map((i) => (i.id === saved.id ? saved : i)));
      toast.success(isActive ? "Re-activated" : "Archived");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(item: Lookup) {
    if (!window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return;

    setBusyId(item.id);
    try {
      await deleteLookup(kind, item.id);
      setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
      toast.success("Deleted");
    } catch (err) {
      // The API blocks deletes while employees still reference it.
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </header>

      <form onSubmit={onAdd} className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          aria-label={`New ${title.toLowerCase()}`}
        />
        <IconButton
          label={`Add ${title.toLowerCase()}`}
          icon={adding ? Loader2 : Plus}
          variant="brand"
          type="submit"
          disabled={adding || !name.trim()}
          className={adding ? "[&_svg]:animate-spin" : undefined}
        />
      </form>

      {items === null ? (
        <div className="mt-5 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-6 py-6 text-center text-sm text-muted-foreground">
          None yet. Add the first one above.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              {editingId === item.id ? (
                <>
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onRename(item);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-9 flex-1"
                  />
                  <IconButton
                    label="Save name"
                    icon={Check}
                    variant="brand"
                    disabled={busyId === item.id}
                    onClick={() => onRename(item)}
                  />
                  <IconButton
                    label="Cancel"
                    icon={X}
                    variant="neutral"
                    onClick={() => setEditingId(null)}
                  />
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {item.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.in_use === 0
                        ? "Not assigned"
                        : `${item.in_use} employee${item.in_use === 1 ? "" : "s"}`}
                    </span>
                  </span>

                  {!item.is_active && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Archived
                    </Badge>
                  )}

                  <Switch
                    checked={item.is_active}
                    disabled={busyId === item.id}
                    onCheckedChange={(v) => onToggle(item, v)}
                    aria-label={`${item.is_active ? "Archive" : "Re-activate"} ${item.name}`}
                  />
                  <IconButton
                    label="Rename"
                    icon={Pencil}
                    variant="brand"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditValue(item.name);
                    }}
                  />
                  <IconButton
                    label="Delete"
                    icon={Trash2}
                    variant="destructive"
                    disabled={busyId === item.id || item.in_use > 0}
                    onClick={() => onDelete(item)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
