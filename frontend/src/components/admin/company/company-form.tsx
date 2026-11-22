"use client";

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  COMPANY_TYPES,
  createCompany,
  updateCompany,
  type Company,
  type CompanyPayload,
  type CompanyType,
} from "@/lib/company";
import { cn } from "@/lib/utils";
import { Section } from "./section";

function toPayload(c: Company | null): CompanyPayload {
  return {
    name: c?.name ?? "",
    slug: c?.slug ?? "",
    company_type: c?.company_type ?? "private_limited",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    address: c?.address ?? "",
    gstin: c?.gstin ?? "",
    pan: c?.pan ?? "",
    cin: c?.cin ?? "",
    tan: c?.tan ?? "",
    pf_code: c?.pf_code ?? "",
    esic_code: c?.esic_code ?? "",
    pt_number: c?.pt_number ?? "",
  };
}

export function CompanyForm({
  company,
  onSaved,
  onCancel,
}: {
  company: Company | null;
  onSaved: (c: Company) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<CompanyPayload>(() => toPayload(company));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CompanyPayload>(key: K, value: CompanyPayload[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      const saved = company
        ? await updateCompany(form)
        : await createCompany(form);
      onSaved(saved);
      toast.success(company ? "Company profile updated" : "Company created");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast.error(err.message);
      } else {
        toast.error("Could not save the company profile");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Section
        title="Identity"
        description="How the company is named and referenced across the system."
      >
        <Field label="Company name" required error={errors.name} className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Acme Technologies Private Limited"
            aria-invalid={!!errors.name}
          />
        </Field>

        <Field
          label="Slug"
          error={errors.slug}
          hint="Used in URLs. Generated from the name when left blank."
        >
          <Input
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="acme-technologies"
            aria-invalid={!!errors.slug}
          />
        </Field>

        <Field label="Company type" required error={errors.company_type}>
          <Select
            value={form.company_type}
            onValueChange={(v) => set("company_type", v as CompanyType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Contact" description="Where official correspondence is sent.">
        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="hr@acme.com"
            aria-invalid={!!errors.email}
          />
        </Field>

        <Field label="Mobile / phone" error={errors.phone}>
          <Input
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+91 98765 43210"
            aria-invalid={!!errors.phone}
          />
        </Field>

        <Field label="Registered address" error={errors.address} className="sm:col-span-2">
          <Textarea
            rows={3}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="4th Floor, Prestige Tower, MG Road, Bengaluru 560001"
          />
        </Field>
      </Section>

      <Section
        title="Statutory registrations"
        description="Required for payroll, payslips and compliance filings."
      >
        <Field label="GSTIN" error={errors.gstin} hint="15 characters">
          <Input
            value={form.gstin}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
            placeholder="29ABCDE1234F1Z5"
            maxLength={15}
            aria-invalid={!!errors.gstin}
            className="font-mono"
          />
        </Field>

        <Field label="PAN" error={errors.pan} hint="10 characters">
          <Input
            value={form.pan}
            onChange={(e) => set("pan", e.target.value.toUpperCase())}
            placeholder="ABCDE1234F"
            maxLength={10}
            aria-invalid={!!errors.pan}
            className="font-mono"
          />
        </Field>

        <Field label="CIN" error={errors.cin} hint="21 characters">
          <Input
            value={form.cin}
            onChange={(e) => set("cin", e.target.value.toUpperCase())}
            placeholder="U72200KA2015PTC012345"
            maxLength={21}
            aria-invalid={!!errors.cin}
            className="font-mono"
          />
        </Field>

        <Field label="TAN" error={errors.tan} hint="Needed to deduct TDS">
          <Input
            value={form.tan}
            onChange={(e) => set("tan", e.target.value.toUpperCase())}
            placeholder="BLRA12345C"
            maxLength={10}
            aria-invalid={!!errors.tan}
            className="font-mono"
          />
        </Field>

        <Field label="PF establishment code" error={errors.pf_code}>
          <Input
            value={form.pf_code}
            onChange={(e) => set("pf_code", e.target.value)}
            placeholder="KN/BNG/12345"
            aria-invalid={!!errors.pf_code}
            className="font-mono"
          />
        </Field>

        <Field label="ESIC code" error={errors.esic_code}>
          <Input
            value={form.esic_code}
            onChange={(e) => set("esic_code", e.target.value)}
            placeholder="53000123450000"
            aria-invalid={!!errors.esic_code}
            className="font-mono"
          />
        </Field>

        <Field label="Professional tax number" error={errors.pt_number}>
          <Input
            value={form.pt_number}
            onChange={(e) => set("pt_number", e.target.value)}
            placeholder="PT987654"
            aria-invalid={!!errors.pt_number}
            className="font-mono"
          />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-5">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            <X className="size-4" />
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="size-4" />
              {company ? "Save changes" : "Create company"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  error,
  hint,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-semibold text-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
