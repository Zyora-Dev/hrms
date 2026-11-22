"use client";

import { useEffect, useRef, useState } from "react";
import { Hash, IdCard, Loader2, Save, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  getEmployeeSettings,
  listCodeTokens,
  previewCode,
  saveEmployeeSettings,
  type CodeToken,
  type EmployeeSettings,
  type EmployeeSettingsPayload,
} from "@/lib/employee-settings";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "EMP-0001", pattern: "EMP-{SEQ}", padding: 4 },
  { label: "ACME/2026/0001", pattern: "ACME/{YYYY}/{SEQ}", padding: 4 },
  { label: "ENG-001", pattern: "{DEPT}-{SEQ}", padding: 3 },
  { label: "2611-001", pattern: "{YY}{MM}-{SEQ}", padding: 3 },
];

function toPayload(s: EmployeeSettings): EmployeeSettingsPayload {
  return {
    code_pattern: s.code_pattern,
    code_padding: s.code_padding,
    code_next_number: s.code_next_number,
    code_reset: s.code_reset,
    allow_manual_code: s.allow_manual_code,
    default_probation_days: s.default_probation_days,
  };
}

export function EmployeeSettingsPanel() {
  const [form, setForm] = useState<EmployeeSettingsPayload | null>(null);
  const [tokens, setTokens] = useState<CodeToken[]>([]);
  const [preview, setPreview] = useState<string[]>([]);
  const [patternError, setPatternError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const patternRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getEmployeeSettings()
      .then((s) => {
        setForm(toPayload(s));
        setPreview(s.preview);
      })
      .catch(() => toast.error("Could not load employee settings"));
    listCodeTokens().then(setTokens).catch(() => setTokens([]));
  }, []);

  // The server renders the preview, so what is shown is what will be issued.
  useEffect(() => {
    if (!form) return;
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      previewCode({
        code_pattern: form.code_pattern,
        code_padding: form.code_padding,
        code_next_number: form.code_next_number,
      })
        .then((codes) => {
          setPreview(codes);
          setPatternError(null);
        })
        .catch((err) => {
          setPreview([]);
          setPatternError(
            err instanceof ApiError ? err.message : "Invalid pattern",
          );
        });
    }, 300);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [form]);

  function set<K extends keyof EmployeeSettingsPayload>(
    key: K,
    value: EmployeeSettingsPayload[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
  }

  function insertToken(token: string) {
    const input = patternRef.current;
    if (!input || !form) return;

    const start = input.selectionStart ?? form.code_pattern.length;
    const end = input.selectionEnd ?? start;
    const next =
      form.code_pattern.slice(0, start) + token + form.code_pattern.slice(end);

    set("code_pattern", next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function onSave() {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await saveEmployeeSettings(form);
      setForm(toPayload(saved));
      setPreview(saved.preview);
      setDirty(false);
      toast.success("Saved — new employees will use this format");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Panel
        icon={IdCard}
        title="Employee ID format"
        description="How the code for a new employee is built. Existing employees keep the code they were given."
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Pattern</Label>
              <Input
                ref={patternRef}
                value={form.code_pattern}
                onChange={(e) => set("code_pattern", e.target.value)}
                className={cn(
                  "font-mono",
                  patternError && "border-destructive focus:border-destructive",
                )}
              />
              {patternError ? (
                <p className="text-[11px] font-medium text-destructive">
                  {patternError}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Click a token to insert it at the cursor.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {tokens.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  title={t.description}
                  onClick={() => insertToken(t.token)}
                  className="rounded border border-border bg-muted/50 px-2 py-1 font-mono text-[11px] text-brand-ink transition-colors hover:bg-accent"
                >
                  {t.token}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Number width
                  <span className="ml-1 font-normal text-muted-foreground">
                    digits
                  </span>
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.code_padding}
                  onChange={(e) => set("code_padding", Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Next number</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.code_next_number}
                  onChange={(e) =>
                    set("code_next_number", Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Restart numbering</Label>
                <div className="flex gap-1.5">
                  {(["never", "yearly"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => set("code_reset", r)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-2 text-[11px] font-semibold capitalize transition-colors",
                        form.code_reset === r
                          ? "border-brand-ink bg-brand-ink text-white"
                          : "border-border bg-card text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {form.code_reset === "yearly"
                ? "The sequence restarts at 1 on the first hire of each financial year (April)."
                : "The sequence keeps counting up and never restarts."}
            </p>
          </div>

          {/* live preview */}
          <aside className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <Hash className="size-3" />
              Next three codes
            </p>
            {patternError ? (
              <p className="mt-3 text-xs text-destructive">
                Fix the pattern to see a preview.
              </p>
            ) : (
              <ul className="mt-2.5 space-y-1.5">
                {preview.map((code, i) => (
                  <li
                    key={code}
                    className={cn(
                      "rounded-lg border px-3 py-2 font-mono text-sm",
                      i === 0
                        ? "border-primary/30 bg-primary/10 font-semibold text-brand-ink"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {code}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Presets
            </p>
            <div className="mt-1.5 space-y-1">
              {PRESETS.map((p) => (
                <button
                  key={p.pattern}
                  type="button"
                  onClick={() => {
                    set("code_pattern", p.pattern);
                    set("code_padding", p.padding);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="font-mono text-[11px]">{p.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {p.pattern}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </Panel>

      <Panel
        icon={UserCog}
        title="Defaults for new employees"
        description="Applied when an employee is added, and overridable per person."
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
          <div>
            <p className="text-sm font-semibold">Allow a code to be typed in</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Off generates every code from the pattern. On lets an admin enter
              one, which is useful when migrating from another system.
            </p>
          </div>
          <Switch
            checked={form.allow_manual_code}
            onCheckedChange={(v) => set("allow_manual_code", v)}
            aria-label="Allow a code to be typed in"
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 pt-1">
          <div>
            <p className="text-sm font-semibold">Probation period</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sets the probation end date this many days after joining. Zero
              leaves it blank.
            </p>
          </div>
          <div className="w-32 space-y-1.5">
            <Label className="text-xs font-semibold">
              Days
            </Label>
            <Input
              type="number"
              min={0}
              max={730}
              value={form.default_probation_days}
              onChange={(e) =>
                set("default_probation_days", Number(e.target.value))
              }
            />
          </div>
        </div>
      </Panel>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/95 px-5 py-3.5 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {dirty
            ? "Unsaved changes. Existing employees are not renumbered."
            : "All changes saved."}
        </p>
        <Button
          onClick={onSave}
          disabled={saving || !dirty || Boolean(patternError)}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
          <Icon className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
