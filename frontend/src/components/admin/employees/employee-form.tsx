"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/admin/company/section";
import { SelectField, TextAreaField, TextField } from "./fields";
import { LookupCombobox } from "./lookup-combobox";
import { Stepper, type Step } from "./stepper";
import {
  ApiError,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  createEmployee,
  emptyEmployee,
  listEmployees,
  toPayload,
  updateEmployee,
  type Employee,
  type EmployeeFields,
} from "@/lib/employees";

const STEPS: Step[] = [
  { id: "personal", title: "Personal", description: "Name, DOB, gender" },
  { id: "contact", title: "Contact", description: "Email, phone, address" },
  { id: "employment", title: "Employment", description: "Role, dates, manager" },
  { id: "payroll", title: "Payroll", description: "CTC, statutory, bank" },
];

/** Which fields belong to which step, so API errors jump to the right one. */
const STEP_FIELDS: string[][] = [
  ["first_name", "middle_name", "last_name", "gender", "date_of_birth", "blood_group", "marital_status"],
  [
    "work_email", "personal_email", "phone", "alternate_phone", "current_address",
    "permanent_address", "emergency_contact_name", "emergency_contact_relation",
    "emergency_contact_phone",
  ],
  [
    "designation_id", "department_id", "employment_type", "work_location",
    "date_of_joining", "probation_end_date", "date_of_exit", "status",
    "reporting_manager_id",
  ],
  [
    "ctc_annual", "pan", "aadhaar", "uan", "pf_number", "esic_number",
    "bank_account_name", "bank_account_number", "bank_ifsc", "bank_name",
  ],
];

function fromEmployee(e: Employee): EmployeeFields {
  const base = emptyEmployee();
  const next = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const value = (e as unknown as Record<string, unknown>)[key];
    next[key] = value === null || value === undefined ? base[key as keyof EmployeeFields] : value;
  }
  return next as EmployeeFields;
}

export function EmployeeForm({ employee }: { employee?: Employee }) {
  const router = useRouter();
  const isEdit = !!employee;

  const [form, setForm] = useState<EmployeeFields>(() =>
    employee ? fromEmployee(employee) : emptyEmployee(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(isEdit ? STEPS.length - 1 : 0);
  const [saving, setSaving] = useState(false);
  const [managers, setManagers] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    listEmployees({ page_size: 100 })
      .then((page) =>
        setManagers(
          page.items
            .filter((m) => m.id !== employee?.id)
            .map((m) => ({
              value: String(m.id),
              label: `${m.full_name} · ${m.employee_code}`,
            })),
        ),
      )
      .catch(() => setManagers([]));
  }, [employee?.id]);

  function set<K extends keyof EmployeeFields>(key: K, value: EmployeeFields[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  /** Client-side checks for the required fields on the current step. */
  function validateStep(index: number): boolean {
    const found: Record<string, string> = {};
    if (index === 0) {
      if (!form.first_name.trim()) found.first_name = "First name is required";
      if (!form.last_name.trim()) found.last_name = "Last name is required";
    }
    if (index === 1) {
      if (!form.work_email.trim()) found.work_email = "Work email is required";
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.work_email.trim()))
        found.work_email = "Enter a valid email address";
    }
    if (index === 2) {
      if (!form.date_of_joining) found.date_of_joining = "Date of joining is required";
    }
    setErrors((e) => ({ ...e, ...found }));
    return Object.keys(found).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setFurthest((f) => Math.max(f, next));
  }

  const invalidStep = useMemo(() => {
    const keys = Object.keys(errors);
    if (!keys.length) return null;
    return STEP_FIELDS.findIndex((fields) => fields.some((f) => keys.includes(f)));
  }, [errors]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Every step's required fields must pass, not just the visible one.
    for (let i = 0; i < STEPS.length; i++) {
      if (!validateStep(i)) {
        setStep(i);
        toast.error("Some required details are missing");
        return;
      }
    }

    setSaving(true);
    setErrors({});
    try {
      const payload = toPayload(form);
      const saved = isEdit
        ? await updateEmployee(employee.id, payload)
        : await createEmployee(payload);
      toast.success(isEdit ? "Employee updated" : `${saved.full_name} added`);
      router.push(`/admin/employees/${saved.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast.error(err.message);
        const target = STEP_FIELDS.findIndex((fields) =>
          fields.some((f) => f in err.fields),
        );
        if (target >= 0) {
          setStep(target);
          setFurthest((f) => Math.max(f, target));
        }
      } else {
        toast.error("Could not save the employee");
      }
    } finally {
      setSaving(false);
    }
  }

  const last = step === STEPS.length - 1;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Stepper
        steps={STEPS}
        current={step}
        furthest={isEdit ? STEPS.length - 1 : furthest}
        onJump={setStep}
      />

      {invalidStep !== null && invalidStep >= 0 && invalidStep !== step && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          There are problems in step {invalidStep + 1} ({STEPS[invalidStep].title}).
        </p>
      )}

      {step === 0 && (
        <Section title="Personal details" description="Basic identity information.">
          <TextField
            label="First name"
            required
            value={form.first_name}
            onChange={(v) => set("first_name", v)}
            error={errors.first_name}
            placeholder="Aarav"
          />
          <TextField
            label="Middle name"
            value={form.middle_name ?? ""}
            onChange={(v) => set("middle_name", v)}
            error={errors.middle_name}
          />
          <TextField
            label="Last name"
            required
            value={form.last_name}
            onChange={(v) => set("last_name", v)}
            error={errors.last_name}
            placeholder="Mehta"
          />
          <SelectField
            label="Gender"
            value={form.gender}
            onChange={(v) => set("gender", v as EmployeeFields["gender"])}
            options={GENDERS}
            allowEmpty
            error={errors.gender}
          />
          <TextField
            label="Date of birth"
            type="date"
            value={form.date_of_birth ?? ""}
            onChange={(v) => set("date_of_birth", v)}
            error={errors.date_of_birth}
          />
          <TextField
            label="Blood group"
            value={form.blood_group ?? ""}
            onChange={(v) => set("blood_group", v)}
            error={errors.blood_group}
            placeholder="O+"
          />
          <SelectField
            label="Marital status"
            value={form.marital_status}
            onChange={(v) => set("marital_status", v as EmployeeFields["marital_status"])}
            options={MARITAL_STATUSES}
            allowEmpty
            error={errors.marital_status}
          />
        </Section>
      )}

      {step === 1 && (
        <>
          <Section title="Contact" description="How to reach the employee.">
            <TextField
              label="Work email"
              required
              type="email"
              value={form.work_email}
              onChange={(v) => set("work_email", v)}
              error={errors.work_email}
              placeholder="aarav.mehta@acme.com"
              hint="Must be unique across employees."
            />
            <TextField
              label="Personal email"
              type="email"
              value={form.personal_email ?? ""}
              onChange={(v) => set("personal_email", v)}
              error={errors.personal_email}
            />
            <TextField
              label="Mobile"
              value={form.phone ?? ""}
              onChange={(v) => set("phone", v)}
              error={errors.phone}
              placeholder="+91 98765 43210"
            />
            <TextField
              label="Alternate phone"
              value={form.alternate_phone ?? ""}
              onChange={(v) => set("alternate_phone", v)}
              error={errors.alternate_phone}
            />
            <TextAreaField
              label="Current address"
              value={form.current_address ?? ""}
              onChange={(v) => set("current_address", v)}
              error={errors.current_address}
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Permanent address"
              value={form.permanent_address ?? ""}
              onChange={(v) => set("permanent_address", v)}
              error={errors.permanent_address}
              className="sm:col-span-2"
            />
          </Section>

          <Section title="Emergency contact" description="Who to call in an emergency.">
            <TextField
              label="Contact name"
              value={form.emergency_contact_name ?? ""}
              onChange={(v) => set("emergency_contact_name", v)}
              error={errors.emergency_contact_name}
            />
            <TextField
              label="Relationship"
              value={form.emergency_contact_relation ?? ""}
              onChange={(v) => set("emergency_contact_relation", v)}
              error={errors.emergency_contact_relation}
              placeholder="Spouse"
            />
            <TextField
              label="Contact phone"
              value={form.emergency_contact_phone ?? ""}
              onChange={(v) => set("emergency_contact_phone", v)}
              error={errors.emergency_contact_phone}
            />
          </Section>
        </>
      )}

      {step === 2 && (
        <Section title="Employment" description="Role, reporting line and key dates.">
          <LookupCombobox
            kind="designations"
            label="Designation"
            value={form.designation_id}
            onChange={(id) => set("designation_id", id)}
            error={errors.designation_id}
          />
          <LookupCombobox
            kind="departments"
            label="Department"
            value={form.department_id}
            onChange={(id) => set("department_id", id)}
            error={errors.department_id}
          />
          <SelectField
            label="Employment type"
            required
            value={form.employment_type}
            onChange={(v) =>
              set("employment_type", (v ?? "full_time") as EmployeeFields["employment_type"])
            }
            options={EMPLOYMENT_TYPES}
            error={errors.employment_type}
          />
          <SelectField
            label="Status"
            required
            value={form.status}
            onChange={(v) => set("status", (v ?? "active") as EmployeeFields["status"])}
            options={EMPLOYEE_STATUSES}
            error={errors.status}
          />
          <TextField
            label="Work location"
            value={form.work_location ?? ""}
            onChange={(v) => set("work_location", v)}
            error={errors.work_location}
            placeholder="Bengaluru"
          />
          <SelectField
            label="Reporting manager"
            value={form.reporting_manager_id ? String(form.reporting_manager_id) : null}
            onChange={(v) => set("reporting_manager_id", v ? Number(v) : null)}
            options={managers}
            allowEmpty
            placeholder="No manager"
            error={errors.reporting_manager_id}
          />
          <TextField
            label="Date of joining"
            required
            type="date"
            value={form.date_of_joining}
            onChange={(v) => set("date_of_joining", v)}
            error={errors.date_of_joining}
          />
          <TextField
            label="Probation end date"
            type="date"
            value={form.probation_end_date ?? ""}
            onChange={(v) => set("probation_end_date", v)}
            error={errors.probation_end_date}
          />
          <TextField
            label="Date of exit"
            type="date"
            value={form.date_of_exit ?? ""}
            onChange={(v) => set("date_of_exit", v)}
            error={errors.date_of_exit}
            hint="Leave blank for current employees."
          />
        </Section>
      )}

      {step === 3 && (
        <>
          <Section title="Compensation & statutory" description="Used by payroll.">
            <TextField
              label="Annual CTC"
              type="number"
              min={0}
              step="0.01"
              value={form.ctc_annual ?? ""}
              onChange={(v) => set("ctc_annual", v)}
              error={errors.ctc_annual}
              placeholder="2400000"
            />
            <TextField
              label="PAN"
              mono
              maxLength={10}
              value={form.pan ?? ""}
              onChange={(v) => set("pan", v.toUpperCase())}
              error={errors.pan}
              placeholder="ABCDE1234F"
            />
            <TextField
              label="Aadhaar"
              mono
              maxLength={12}
              value={form.aadhaar ?? ""}
              onChange={(v) => set("aadhaar", v)}
              error={errors.aadhaar}
              // The stored number never comes back from the API, so the
              // placeholder says what is already on file.
              placeholder={
                employee?.aadhaar_masked
                  ? `On file: ${employee.aadhaar_masked}`
                  : "123456789012"
              }
            />
            <TextField
              label="UAN"
              mono
              maxLength={12}
              value={form.uan ?? ""}
              onChange={(v) => set("uan", v)}
              error={errors.uan}
              hint="Universal Account Number for PF."
            />
            <TextField
              label="PF number"
              mono
              value={form.pf_number ?? ""}
              onChange={(v) => set("pf_number", v)}
              error={errors.pf_number}
            />
            <TextField
              label="ESIC number"
              mono
              value={form.esic_number ?? ""}
              onChange={(v) => set("esic_number", v)}
              error={errors.esic_number}
            />
          </Section>

          <Section title="Bank account" description="Where salary is credited.">
            <TextField
              label="Account holder name"
              value={form.bank_account_name ?? ""}
              onChange={(v) => set("bank_account_name", v)}
              error={errors.bank_account_name}
            />
            <TextField
              label="Account number"
              mono
              value={form.bank_account_number ?? ""}
              onChange={(v) => set("bank_account_number", v)}
              error={errors.bank_account_number}
            />
            <TextField
              label="IFSC"
              mono
              maxLength={11}
              value={form.bank_ifsc ?? ""}
              onChange={(v) => set("bank_ifsc", v.toUpperCase())}
              error={errors.bank_ifsc}
              placeholder="HDFC0001234"
            />
            <TextField
              label="Bank name"
              value={form.bank_name ?? ""}
              onChange={(v) => set("bank_name", v)}
              error={errors.bank_name}
            />
          </Section>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || saving}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </span>

          {!last && !isEdit ? (
            <Button type="button" onClick={goNext}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <>
              {!last && (
                <Button type="button" variant="outline" onClick={goNext}>
                  Next
                  <ArrowRight className="size-4" />
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
                    {isEdit ? "Save changes" : "Create employee"}
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
