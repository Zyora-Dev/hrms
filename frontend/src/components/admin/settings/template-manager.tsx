"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  getTemplate,
  listMergeFields,
  listTemplates,
  saveTemplate,
  type LetterTemplate,
  type LetterTemplateFull,
  type MergeField,
} from "@/lib/letters";

export function TemplateManager() {
  const [items, setItems] = useState<LetterTemplate[] | null>(null);
  const [mergeFields, setMergeFields] = useState<MergeField[]>([]);
  const [editing, setEditing] = useState<LetterTemplateFull | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    listTemplates(true)
      .then((rows) => alive && setItems(rows))
      .catch(() => alive && setItems([]));
    listMergeFields()
      .then((f) => alive && setMergeFields(f))
      .catch(() => alive && setMergeFields([]));
    return () => {
      alive = false;
    };
  }, []);

  async function onOpen(item: LetterTemplate) {
    setBusyId(item.id);
    try {
      setEditing(await getTemplate(item.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open template");
    } finally {
      setBusyId(null);
    }
  }

  async function onToggle(item: LetterTemplate, isActive: boolean) {
    setBusyId(item.id);
    try {
      const full = await getTemplate(item.id);
      const saved = await saveTemplate(item.id, { ...full, is_active: isActive });
      setItems((prev) =>
        (prev ?? []).map((i) =>
          i.id === saved.id ? { ...i, is_active: saved.is_active } : i,
        ),
      );
      toast.success(isActive ? "Enabled" : "Disabled");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  async function onSave() {
    if (!editing) return;
    setSaving(true);
    try {
      const saved = await saveTemplate(editing.id, editing);
      setItems((prev) =>
        (prev ?? []).map((i) =>
          i.id === saved.id
            ? { ...i, name: saved.name, subject: saved.subject, category: saved.category }
            : i,
        ),
      );
      setEditing(null);
      toast.success("Template saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function insertField(name: string) {
    setEditing((t) => (t ? { ...t, body: `${t.body}\n<p>{{${name}}}</p>` } : t));
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="text-sm font-semibold text-foreground">Letter templates</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Wording used when generating letters from an employee&apos;s profile.
          Use <code className="font-mono">{"{{placeholders}}"}</code> to merge in
          their details.
        </p>
      </header>

      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {item.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.category}
                  {item.inputs.length > 0 &&
                    ` · ${item.inputs.length} input${item.inputs.length === 1 ? "" : "s"}`}
                </span>
              </span>

              {item.is_builtin && (
                <Badge variant="outline" className="text-muted-foreground">
                  Built-in
                </Badge>
              )}

              <Switch
                checked={item.is_active}
                disabled={busyId === item.id}
                onCheckedChange={(v) => onToggle(item, v)}
                aria-label={`${item.is_active ? "Disable" : "Enable"} ${item.name}`}
              />
              <IconButton
                label="Edit template"
                icon={busyId === item.id ? Loader2 : Pencil}
                variant="brand"
                disabled={busyId === item.id}
                onClick={() => onOpen(item)}
                className={busyId === item.id ? "[&_svg]:animate-spin" : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border/60 p-5">
            <DialogTitle>Edit template</DialogTitle>
            <DialogDescription>
              HTML is supported. Placeholders are replaced per employee.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="max-h-[64vh] space-y-4 overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Name</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Category</Label>
                  <Input
                    value={editing.category}
                    onChange={(e) =>
                      setEditing({ ...editing, category: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Subject / heading
                </Label>
                <Input
                  value={editing.subject}
                  onChange={(e) =>
                    setEditing({ ...editing, subject: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Body</Label>
                <Textarea
                  rows={14}
                  value={editing.body}
                  onChange={(e) =>
                    setEditing({ ...editing, body: e.target.value })
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Click to append a placeholder
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {mergeFields.map((f) => (
                    <button
                      key={f.name}
                      type="button"
                      title={f.label}
                      onClick={() => insertField(f.name)}
                      className="rounded border border-border bg-muted/50 px-2 py-1 font-mono text-[11px] text-brand-ink hover:bg-accent"
                    >
                      {`{{${f.name}}}`}
                    </button>
                  ))}
                  {editing.inputs.map((i) => (
                    <button
                      key={i.name}
                      type="button"
                      title={`${i.label} (typed at generation time)`}
                      onClick={() => insertField(i.name)}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[11px] text-amber-800 hover:bg-amber-500/20"
                    >
                      {`{{${i.name}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="tpl-active"
                  checked={editing.is_active}
                  onCheckedChange={(v) =>
                    setEditing({ ...editing, is_active: v })
                  }
                />
                <Label htmlFor="tpl-active" className="text-sm font-normal">
                  Available when generating letters
                </Label>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-border/60 p-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              <X className="size-4" />
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
