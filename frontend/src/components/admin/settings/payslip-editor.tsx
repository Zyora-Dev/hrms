"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Image as ImageIcon,
  Loader2,
  Palette,
  Plus,
  Save,
  Star,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  DEFAULT_PAYSLIP_OPTIONS,
  PAYSLIP_TEMPLATES,
  createLayout,
  deleteLayout,
  listLayouts,
  previewLayout,
  updateLayout,
  uploadPayslipLogo,
  type PayslipLayout,
  type PayslipOptions,
} from "@/lib/payroll";
import { API_URL } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { cn } from "@/lib/utils";

const SWATCHES = [
  "#072869",
  "#0b4f6c",
  "#14532d",
  "#7a1f3d",
  "#5b2d90",
  "#1f2937",
];

/** Blocks the admin can switch on or off, in the order they appear. */
const BLOCKS: { key: keyof PayslipOptions; label: string; hint: string }[] = [
  { key: "show_company_address", label: "Company address line", hint: "Address, email and phone under the name." },
  { key: "show_employee_meta", label: "Employee details", hint: "Code, designation, department, PAN, bank." },
  { key: "show_attendance_stats", label: "Attendance summary", hint: "Payable days, LOP, hours and overtime." },
  { key: "show_notes", label: "Line notes", hint: "The small print under a line, e.g. “22 of 26 days”." },
  { key: "show_leave_table", label: "Leave movement", hint: "Opening, accrued, used, encashed, carried." },
  { key: "show_employer_contributions", label: "Employer contributions", hint: "Shown separately — never deducted." },
  { key: "show_net_in_words", label: "Net pay in words", hint: "“Rupees Fifty Four Thousand Ten Only”." },
  { key: "show_signature", label: "Signature block", hint: "A signing line at the foot of the slip." },
];

export function PayslipEditor() {
  const [layouts, setLayouts] = useState<PayslipLayout[] | null>(null);
  const [active, setActive] = useState<PayslipLayout | null>(null);
  const [options, setOptions] = useState<PayslipOptions>(DEFAULT_PAYSLIP_OPTIONS);
  const [base, setBase] = useState<string>("classic");
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [sample, setSample] = useState(true);
  const [rendering, setRendering] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  const logoPreview =
    options.logo_source === "custom"
      ? options.logo_path
        ? `${API_URL}${options.logo_path}`
        : null
      : companyLogo;

  useEffect(() => {
    getCompany()
      .then((c) => setCompanyLogo(c?.logo_url ?? null))
      .catch(() => setCompanyLogo(null));
  }, []);

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      set("logo_path", await uploadPayslipLogo(file));
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const loadInto = useCallback((layout: PayslipLayout | null) => {
    setActive(layout);
    setBase(layout?.base ?? "classic");
    setName(layout?.name ?? "New payslip design");
    setOptions({ ...DEFAULT_PAYSLIP_OPTIONS, ...(layout?.options ?? {}) });
    setDirty(false);
    setRendering(true);
  }, []);

  useEffect(() => {
    listLayouts()
      .then((rows) => {
        setLayouts(rows);
        if (rows.length) loadInto(rows.find((r) => r.is_default) ?? rows[0]);
      })
      .catch(() => setLayouts([]));
  }, [loadInto]);

  // Re-render the preview from the server, debounced, so the editor always
  // shows exactly what the PDF will contain.
  // The spinner is raised by whatever changed the design (an event handler),
  // and cleared here once the server returns — no synchronous setState in the
  // effect body, which would cascade renders.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      previewLayout({ base, options })
        .then((r) => {
          setHtml(r.html);
          setSample(r.sample);
        })
        .catch(() => setHtml("<p style='font-family:sans-serif'>Preview failed</p>"))
        .finally(() => setRendering(false));
    }, 300);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [base, options]);

  function set<K extends keyof PayslipOptions>(key: K, value: PayslipOptions[K]) {
    setOptions((o) => ({ ...o, [key]: value }));
    setDirty(true);
    setRendering(true);
  }

  async function onSave() {
    setSaving(true);
    try {
      const payload = {
        name: name.trim() || "Untitled",
        base: base as PayslipLayout["base"],
        options,
        is_default: active?.is_default ?? layouts?.length === 0,
      };
      const saved = active
        ? await updateLayout(active.id, payload)
        : await createLayout(payload);

      const rows = await listLayouts();
      setLayouts(rows);
      loadInto(rows.find((r) => r.id === saved.id) ?? saved);
      toast.success("Payslip design saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function onMakeDefault(layout: PayslipLayout) {
    try {
      await updateLayout(layout.id, { ...layout, is_default: true });
      setLayouts(await listLayouts());
      toast.success(`“${layout.name}” is now the default`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    }
  }

  async function onDelete(layout: PayslipLayout) {
    if (!window.confirm(`Delete “${layout.name}”?`)) return;
    try {
      await deleteLayout(layout.id);
      const rows = await listLayouts();
      setLayouts(rows);
      if (active?.id === layout.id) loadInto(rows[0] ?? null);
      toast.success("Design deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-5">
      {/* saved designs */}
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Saved designs
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => loadInto(null)}
          >
            <Plus className="size-3.5" />
            New design
          </Button>
          {active && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                setActive(null);
                setName(`${name} copy`);
                setDirty(true);
              }}
            >
              <Copy className="size-3.5" />
              Duplicate
            </Button>
          )}
        </div>

        {layouts === null ? (
          <Skeleton className="mt-3 h-9 w-full" />
        ) : layouts.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            None yet — design one below and save it.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {layouts.map((l) => (
              <li
                key={l.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5",
                  active?.id === l.id
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-card",
                )}
              >
                <button
                  type="button"
                  onClick={() => loadInto(l)}
                  className="text-xs font-semibold"
                >
                  {l.name}
                </button>
                {l.is_default && (
                  <Badge className="bg-primary/15 text-[10px] font-semibold text-primary hover:bg-primary/15">
                    Default
                  </Badge>
                )}
                {!l.is_default && (
                  <IconButton
                    label="Make default"
                    icon={Star}
                    variant="neutral"
                    size="sm"
                    onClick={() => onMakeDefault(l)}
                  />
                )}
                <IconButton
                  label="Delete design"
                  icon={Trash2}
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(l)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* ---- controls ---- */}
        <div className="space-y-4">
          <Group title="Design">
            <Field label="Design name">
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                className="h-8 text-xs"
              />
            </Field>

            <Field label="Base layout">
              <div className="grid gap-1.5">
                {PAYSLIP_TEMPLATES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setBase(t.value);
                      setDirty(true);
                      setRendering(true);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      base === t.value
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-card hover:bg-accent/40",
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          base === t.value ? "text-brand-ink" : "",
                        )}
                      >
                        {t.label}
                      </span>
                      {base === t.value && <Check className="size-3.5 text-brand-ink" />}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {t.hint}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          </Group>

          <Group title="Logo" icon={ImageIcon}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Show a logo</p>
                <p className="text-[11px] text-muted-foreground">
                  Printed at the top of every payslip.
                </p>
              </div>
              <Switch
                checked={options.show_logo}
                onCheckedChange={(v) => set("show_logo", v)}
                aria-label="Show a logo"
              />
            </div>

            <div
              className={cn(
                "space-y-3.5",
                !options.show_logo && "pointer-events-none opacity-50",
              )}
            >
              <div className="flex gap-1.5">
                {(
                  [
                    ["company", "From company profile"],
                    ["custom", "Upload your own"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("logo_source", value)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors",
                      options.logo_source === value
                        ? "border-brand-ink bg-brand-ink text-white"
                        : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoPreview}
                      alt="Payslip logo"
                      className="size-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">None</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {options.logo_source === "company" ? (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        Using the logo from the Company profile.
                      </p>
                      <Link
                        href="/admin/company"
                        className="text-[11px] font-semibold text-brand-ink underline-offset-2 hover:underline"
                      >
                        Change it on the Company page
                      </Link>
                    </>
                  ) : (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={onPickLogo}
                        className="hidden"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={uploading}
                          onClick={() => fileRef.current?.click()}
                        >
                          {uploading ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Upload className="size-3" />
                          )}
                          {options.logo_path ? "Replace" : "Upload"}
                        </Button>
                        {options.logo_path && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                            onClick={() => set("logo_path", null)}
                          >
                            <Trash2 className="size-3" />
                            Remove
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        PNG, JPEG or WebP, up to 2 MB.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <Field label="Alignment">
                <div className="flex gap-1.5">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => set("logo_align", a)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize transition-colors",
                        options.logo_align === a
                          ? "border-brand-ink bg-brand-ink text-white"
                          : "border-border bg-card text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Height">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={16}
                    max={64}
                    value={options.logo_height}
                    onChange={(e) => set("logo_height", Number(e.target.value))}
                    className="flex-1 accent-[var(--brand-ink)]"
                  />
                  <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
                    {options.logo_height}pt
                  </span>
                </div>
              </Field>
            </div>
          </Group>

          <Group title="Branding" icon={Palette}>
            <Field label="Accent colour">
              <div className="flex flex-wrap items-center gap-1.5">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => set("accent_color", c)}
                    style={{ background: c }}
                    className={cn(
                      "size-7 rounded-md border-2",
                      options.accent_color.toLowerCase() === c
                        ? "border-foreground"
                        : "border-transparent",
                    )}
                  />
                ))}
                <Input
                  value={options.accent_color}
                  onChange={(e) => set("accent_color", e.target.value)}
                  className="h-7 w-[92px] font-mono text-[11px]"
                />
              </div>
            </Field>

            <Field label="Document title">
              <Input
                value={options.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Payslip / Salary Slip"
                className="h-8 text-xs"
              />
            </Field>

            <Field label="Density">
              <div className="flex gap-1.5">
                {(["comfortable", "compact"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("density", d)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize transition-colors",
                      options.density === d
                        ? "border-brand-ink bg-brand-ink text-white"
                        : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          </Group>

          <Group title="Blocks">
            <ul className="space-y-2.5">
              {BLOCKS.map((b) => (
                <li key={b.key} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{b.label}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {b.hint}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(options[b.key])}
                    onCheckedChange={(v) => set(b.key, v as never)}
                    aria-label={b.label}
                  />
                </li>
              ))}
            </ul>
          </Group>

          <Group title="Wording" icon={Type}>
            <Field label="Signature label">
              <Input
                value={options.signature_label}
                disabled={!options.show_signature}
                onChange={(e) => set("signature_label", e.target.value)}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="Footer note">
              <Textarea
                rows={2}
                value={options.footer_note}
                onChange={(e) => set("footer_note", e.target.value)}
                className="text-xs"
              />
            </Field>
          </Group>
        </div>

        {/* ---- live preview ---- */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em]">
                  Live preview
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {sample
                    ? "Sample data — run payroll to preview a real payslip."
                    : "Rendered from a real payslip."}
                </p>
              </div>
              {rendering && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="bg-muted/40 p-3">
              <iframe
                title="Payslip preview"
                srcDoc={html}
                sandbox=""
                className="h-[640px] w-full rounded-lg border border-border bg-white"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {dirty ? "Unsaved changes." : "Saved."}
            </p>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              {active ? "Save design" : "Create design"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {title}
      </h3>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold">{label}</Label>
      {children}
    </div>
  );
}
