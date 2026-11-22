"use client";

import { useEffect, useState } from "react";
import { Loader2, Percent, Plus, Save, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { IconButton } from "@/components/admin/icon-button";
import {
  ApiError,
  createSection,
  deleteSection,
  listRegimes,
  listSections,
  saveRegime,
  saveSection,
  type DeductionSection,
  type TaxBand,
  type TaxRegime,
} from "@/lib/tax";
import { currentFy, fyLabel } from "@/lib/tds";
import { cn } from "@/lib/utils";

export function TaxSettingsPanel() {
  const [fy, setFy] = useState(() => currentFy());
  // Keyed by year so switching years shows the skeleton again without a
  // second state write — the loaded year simply no longer matches.
  const [loaded, setLoaded] = useState<{ fy: number; rows: TaxRegime[] } | null>(
    null,
  );
  const [code, setCode] = useState<"new" | "old">("new");
  const [sections, setSections] = useState<DeductionSection[] | null>(null);

  useEffect(() => {
    let alive = true;
    listRegimes(fy)
      .then((rows) => alive && setLoaded({ fy, rows }))
      .catch(() => alive && setLoaded({ fy, rows: [] }));
    return () => {
      alive = false;
    };
  }, [fy]);

  const regimes = loaded?.fy === fy ? loaded.rows : null;

  useEffect(() => {
    listSections()
      .then(setSections)
      .catch(() => setSections([]));
  }, []);

  const regime = regimes?.find((r) => r.code === code) ?? null;
  const years = [currentFy() + 1, currentFy(), currentFy() - 1];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
        <header className="mb-5 flex flex-wrap items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
            <Percent className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Tax regimes</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Slabs, rebate and surcharge for each year. Nothing here is written
              into the code, so a Finance Act change is an edit on this page.
            </p>
          </div>
          <Select value={String(fy)} onValueChange={(v) => setFy(Number(v))}>
            <SelectTrigger className="h-9 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  FY {fyLabel(y)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </header>

        <div className="mb-5 flex gap-1.5">
          {(["new", "old"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCode(c)}
              className={cn(
                "rounded-lg border px-4 py-2 text-xs font-semibold capitalize transition-colors",
                code === c
                  ? "border-brand-ink bg-brand-ink text-white"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/40",
              )}
            >
              {c} regime
            </button>
          ))}
        </div>

        {regimes === null ? (
          <Skeleton className="h-80 w-full rounded-xl" />
        ) : regime ? (
          <RegimeEditor
            key={regime.id}
            regime={regime}
            onSaved={(saved) =>
              setLoaded((prev) =>
                prev === null
                  ? prev
                  : {
                      ...prev,
                      rows: prev.rows.map((r) =>
                        r.id === saved.id ? saved : r,
                      ),
                    },
              )
            }
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
            No {code} regime defined for FY {fyLabel(fy)}. Seed it on the server
            with <span className="font-mono">scripts/seed_tax.py</span>.
          </p>
        )}
      </section>

      <SectionsPanel rows={sections} onChange={setSections} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RegimeEditor({
  regime,
  onSaved,
}: {
  regime: TaxRegime;
  onSaved: (r: TaxRegime) => void;
}) {
  const [form, setForm] = useState(regime);
  const [slabs, setSlabs] = useState<TaxBand[]>(regime.slabs);
  const [surcharges, setSurcharges] = useState<TaxBand[]>(regime.surcharges);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TaxRegime>(key: K, value: TaxRegime[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function onSave() {
    setSaving(true);
    try {
      const saved = await saveRegime(regime.id, {
        financial_year: form.financial_year,
        code: form.code,
        name: form.name,
        standard_deduction: form.standard_deduction,
        rebate_income_limit: form.rebate_income_limit,
        rebate_max_amount: form.rebate_max_amount,
        marginal_relief: form.marginal_relief,
        cess_percent: form.cess_percent,
        surcharge_cap_percent: form.surcharge_cap_percent,
        allow_chapter_vi: form.allow_chapter_vi,
        is_default: form.is_default,
        is_active: form.is_active,
        slabs: slabs.map((b) => ({
          upto: b.upto === "" || b.upto === null ? null : b.upto,
          rate_percent: b.rate_percent || "0",
        })),
        surcharges: surcharges.map((b) => ({
          upto: b.upto === "" || b.upto === null ? null : b.upto,
          rate_percent: b.rate_percent || "0",
        })),
      });
      onSaved(saved);
      setForm(saved);
      setSlabs(saved.slabs);
      setSurcharges(saved.surcharges);
      setDirty(false);
      toast.success("Regime saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => set("name", v)}
          type="text"
        />
        <Field
          label="Standard deduction"
          value={form.standard_deduction}
          onChange={(v) => set("standard_deduction", v)}
        />
        <Field
          label="Rebate up to income"
          value={form.rebate_income_limit}
          onChange={(v) => set("rebate_income_limit", v)}
          hint="Tax is wiped out below this."
        />
        <Field
          label="Maximum rebate"
          value={form.rebate_max_amount}
          onChange={(v) => set("rebate_max_amount", v)}
        />
        <Field
          label="Cess %"
          step="0.01"
          value={form.cess_percent}
          onChange={(v) => set("cess_percent", v)}
        />
        <Field
          label="Surcharge cap %"
          step="0.01"
          value={form.surcharge_cap_percent}
          onChange={(v) => set("surcharge_cap_percent", v)}
          hint="Highest rate any band may reach."
        />
        <div className="flex flex-col justify-end gap-3 pb-1.5">
          <Check
            label="Marginal relief"
            hint="Crossing a threshold never costs more than the income above it."
            checked={form.marginal_relief}
            onChange={(v) => set("marginal_relief", v)}
          />
          <Check
            label="Chapter VI-A deductions"
            hint="80C, 80D, HRA and the rest."
            checked={form.allow_chapter_vi}
            onChange={(v) => set("allow_chapter_vi", v)}
          />
        </div>
        <div className="flex flex-col justify-end gap-3 pb-1.5">
          <Check
            label="Default regime"
            hint="Applied when nobody has declared."
            checked={form.is_default}
            onChange={(v) => set("is_default", v)}
          />
          <Check
            label="Active"
            hint="Turn off to stop it being offered."
            checked={form.is_active}
            onChange={(v) => set("is_active", v)}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BandEditor
          title="Slabs"
          description="Each band is taxed only on the slice of income inside it. Leave the last upper limit blank for 'and above'."
          bands={slabs}
          onChange={(b) => {
            setSlabs(b);
            setDirty(true);
          }}
        />
        <BandEditor
          title="Surcharge"
          description="One rate applied to the whole tax, chosen by total income."
          bands={surcharges}
          onChange={(b) => {
            setSurcharges(b);
            setDirty(true);
          }}
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
        {dirty && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
        <Button onClick={onSave} disabled={!dirty || saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save regime
        </Button>
      </div>
    </div>
  );
}

function BandEditor({
  title,
  description,
  bands,
  onChange,
}: {
  title: string;
  description: string;
  bands: TaxBand[];
  onChange: (bands: TaxBand[]) => void;
}) {
  function edit(index: number, patch: Partial<TaxBand>) {
    onChange(bands.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground">
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <IconButton
          label={`Add ${title.toLowerCase()} band`}
          size="sm"
          icon={Plus}
          onClick={() => onChange([...bands, { upto: null, rate_percent: "0" }])}
        />
      </div>

      {bands.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
          No bands — nothing is charged.
        </p>
      ) : (
        <ul className="space-y-2">
          <li className="grid grid-cols-[1fr_110px_32px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            <span>Up to</span>
            <span className="text-right">Rate %</span>
            <span />
          </li>
          {bands.map((band, i) => (
            <li
              key={band.id ?? `new-${i}`}
              className="grid grid-cols-[1fr_110px_32px] items-center gap-2"
            >
              <Input
                type="number"
                min={0}
                value={band.upto ?? ""}
                placeholder="and above"
                onChange={(e) =>
                  edit(i, { upto: e.target.value === "" ? null : e.target.value })
                }
                className="h-8 text-xs"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={band.rate_percent}
                onChange={(e) => edit(i, { rate_percent: e.target.value })}
                className="h-8 text-right text-xs"
              />
              <IconButton
                label="Remove band"
                size="sm"
                variant="destructive"
                icon={Trash2}
                onClick={() => onChange(bands.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const BLANK: Omit<DeductionSection, "id"> = {
  code: "",
  name: "",
  max_amount: null,
  allowed_in_old: true,
  allowed_in_new: false,
  sort_order: 0,
  is_active: true,
  note: null,
};

function SectionsPanel({
  rows,
  onChange,
}: {
  rows: DeductionSection[] | null;
  onChange: (rows: DeductionSection[]) => void;
}) {
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!draft.code.trim() || !draft.name.trim()) return;
    setBusy(true);
    try {
      const created = await createSection(draft);
      onChange([...(rows ?? []), created]);
      setDraft(BLANK);
      toast.success(`${created.code} added`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  async function patch(row: DeductionSection, change: Partial<DeductionSection>) {
    const next = { ...row, ...change };
    onChange((rows ?? []).map((r) => (r.id === row.id ? next : r)));
    try {
      await saveSection(row.id, next);
    } catch (err) {
      onChange((rows ?? []).map((r) => (r.id === row.id ? row : r)));
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  async function remove(row: DeductionSection) {
    onChange((rows ?? []).filter((r) => r.id !== row.id));
    try {
      await deleteSection(row.id);
    } catch (err) {
      onChange(rows ?? []);
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
          <Scale className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Deduction sections
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            What employees may claim, and the ceiling on each. A claim above the
            ceiling is capped, not rejected.
          </p>
        </div>
      </header>

      {rows === null ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                <th className="px-2 text-left">Code</th>
                <th className="px-2 text-left">Name</th>
                <th className="px-2 text-right">Max amount</th>
                <th className="px-2 text-center">Old</th>
                <th className="px-2 text-center">New</th>
                <th className="px-2 text-center">Active</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="align-middle">
                  <td className="px-2">
                    <Input
                      value={row.code}
                      onChange={(e) =>
                        onChange(
                          rows.map((r) =>
                            r.id === row.id ? { ...r, code: e.target.value } : r,
                          ),
                        )
                      }
                      onBlur={() => patch(row, {})}
                      className="h-8 w-28 font-mono text-xs"
                    />
                  </td>
                  <td className="px-2">
                    <Input
                      value={row.name}
                      onChange={(e) =>
                        onChange(
                          rows.map((r) =>
                            r.id === row.id ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                      onBlur={() => patch(row, {})}
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="px-2">
                    <Input
                      type="number"
                      min={0}
                      value={row.max_amount ?? ""}
                      placeholder="no cap"
                      onChange={(e) =>
                        onChange(
                          rows.map((r) =>
                            r.id === row.id
                              ? {
                                  ...r,
                                  max_amount:
                                    e.target.value === "" ? null : e.target.value,
                                }
                              : r,
                          ),
                        )
                      }
                      onBlur={() => patch(row, {})}
                      className="h-8 w-32 text-right text-xs"
                    />
                  </td>
                  <td className="px-2 text-center">
                    <Switch
                      checked={row.allowed_in_old}
                      onCheckedChange={(v) => patch(row, { allowed_in_old: v })}
                      aria-label={`${row.code} in old regime`}
                    />
                  </td>
                  <td className="px-2 text-center">
                    <Switch
                      checked={row.allowed_in_new}
                      onCheckedChange={(v) => patch(row, { allowed_in_new: v })}
                      aria-label={`${row.code} in new regime`}
                    />
                  </td>
                  <td className="px-2 text-center">
                    <Switch
                      checked={row.is_active}
                      onCheckedChange={(v) => patch(row, { is_active: v })}
                      aria-label={`${row.code} active`}
                    />
                  </td>
                  <td className="px-2 text-right">
                    <IconButton
                      label={`Delete ${row.code}`}
                      size="sm"
                      variant="destructive"
                      icon={Trash2}
                      onClick={() => remove(row)}
                    />
                  </td>
                </tr>
              ))}

              <tr className="align-middle">
                <td className="px-2">
                  <Input
                    value={draft.code}
                    placeholder="80TTB"
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, code: e.target.value }))
                    }
                    className="h-8 w-28 font-mono text-xs"
                  />
                </td>
                <td className="px-2">
                  <Input
                    value={draft.name}
                    placeholder="Interest income of senior citizens"
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                </td>
                <td className="px-2">
                  <Input
                    type="number"
                    min={0}
                    value={draft.max_amount ?? ""}
                    placeholder="no cap"
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        max_amount: e.target.value === "" ? null : e.target.value,
                      }))
                    }
                    className="h-8 w-32 text-right text-xs"
                  />
                </td>
                <td className="px-2 text-center">
                  <Switch
                    checked={draft.allowed_in_old}
                    onCheckedChange={(v) =>
                      setDraft((d) => ({ ...d, allowed_in_old: v }))
                    }
                    aria-label="New section in old regime"
                  />
                </td>
                <td className="px-2 text-center">
                  <Switch
                    checked={draft.allowed_in_new}
                    onCheckedChange={(v) =>
                      setDraft((d) => ({ ...d, allowed_in_new: v }))
                    }
                    aria-label="New section in new regime"
                  />
                </td>
                <td colSpan={2} className="px-2 text-right">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={add}
                    disabled={busy || !draft.code.trim() || !draft.name.trim()}
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Add
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Field({
  label,
  value,
  onChange,
  hint,
  step,
  type = "number",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type={type}
        step={type === "number" ? (step ?? "1") : undefined}
        min={type === "number" ? 0 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-sm"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}
