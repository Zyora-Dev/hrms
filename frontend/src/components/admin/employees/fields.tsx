"use client";

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
import { cn } from "@/lib/utils";

export function Field({
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
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  className,
  mono,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  mono?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={mono ? "font-mono" : undefined}
        {...props}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  className,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  className?: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label} error={error} className={className}>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
      />
    </Field>
  );
}

const NONE = "__none__";

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  required,
  placeholder = "Select…",
  allowEmpty,
  className,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: readonly { value: string; label: string }[];
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
}) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger className="w-full" aria-invalid={!!error}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value={NONE}>{placeholder}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
