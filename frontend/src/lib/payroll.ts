import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export const LOP_BASES = [
  {
    value: "standard_days",
    label: "Standard days",
    hint: "A fixed number of days per month, regardless of the calendar.",
  },
  {
    value: "calendar_days",
    label: "Calendar days",
    hint: "The actual number of days in the month (28–31).",
  },
  {
    value: "working_days",
    label: "Working days",
    hint: "Days excluding weekly offs, derived from attendance.",
  },
  {
    value: "shift_hours",
    label: "Shift hours",
    hint: "Pay follows hours worked against the shift, so overnight and continued shifts count in full.",
  },
] as const;

export const COMPONENT_CALCS = [
  { value: "percent_of_gross", label: "% of gross", suffix: "%" },
  { value: "percent_of_basic", label: "% of basic", suffix: "%" },
  { value: "fixed", label: "Fixed amount", suffix: "₹" },
  { value: "balance", label: "Balance of gross", suffix: "" },
] as const;

export type LopBasis = (typeof LOP_BASES)[number]["value"];
export type ComponentCalc = (typeof COMPONENT_CALCS)[number]["value"];

export type PayrollSettings = {
  id: number;
  lop_basis: LopBasis;
  standard_days_per_month: number;
  round_net_to: number;
  pay_overtime: boolean;
  overtime_rate_basis: "basic" | "gross";
  overtime_multiplier: string;
  leave_encashment_enabled: boolean;
  encashment_basis: "basic" | "gross";
  pf_enabled: boolean;
  pf_employee_percent: string;
  pf_employer_percent: string;
  pf_wage_ceiling: string;
  pf_cap_at_ceiling: boolean;
  esi_enabled: boolean;
  esi_employee_percent: string;
  esi_employer_percent: string;
  esi_gross_ceiling: string;
  pt_enabled: boolean;
  pt_amount: string;
  tds_enabled: boolean;
  tds_default_regime: "new" | "old";
  payslip_template: "classic" | "modern" | "compact";
  bonus_enabled: boolean;
  bonus_eligibility_ceiling: string;
  bonus_calculation_ceiling: string;
  bonus_minimum_wage: string;
  bonus_min_percent: string;
  bonus_max_percent: string;
  bonus_rate_percent: string;
  bonus_min_days: number;
  bonus_basis: "basic" | "basic_da" | "gross";
  advance_enabled: boolean;
  advance_default_percent: string;
  advance_max_percent: string;
  advance_allow_custom_amount: boolean;
  advance_basis: "basic" | "gross";
  updated_at: string;
};

export type PayrollSettingsPayload = Omit<PayrollSettings, "id" | "updated_at">;

export type SalaryComponent = {
  id: number;
  code: string;
  name: string;
  kind: "earning" | "deduction";
  calculation: ComponentCalc;
  value: string;
  prorate_on_lop: boolean;
  is_taxable: boolean;
  include_in_pf: boolean;
  include_in_esi: boolean;
  sort_order: number;
  is_active: boolean;
};

export type LeaveType = {
  id: number;
  code: string;
  name: string;
  monthly_accrual: string;
  annual_cap: string | null;
  is_paid: boolean;
  carry_forward: boolean;
  carry_forward_cap: string | null;
  encash_unused: boolean;
  encashment_percent: string;
  requires_approval: boolean;
  allow_half_day: boolean;
  min_notice_days: number;
  max_consecutive_days: string | null;
  allow_negative_balance: boolean;
  applicable_after_days: number;
  applies_to: "all" | "male" | "female";
  is_active: boolean;
};

export type PayslipLine = {
  code: string;
  name: string;
  amount: string;
  note: string | null;
};

export type LeaveLine = {
  code: string;
  name: string;
  opening: string;
  accrued: string;
  used: string;
  encashed: string;
  lapsed: string;
  closing: string;
  encashment_amount: string;
};

export type Payslip = {
  id: number;
  run_id: number;
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  designation: string | null;
  monthly_gross: string;
  period_days: string;
  payable_days: string;
  lop_days: string;
  worked_minutes: number;
  overtime_minutes: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  employer_contributions: PayslipLine[];
  leave: LeaveLine[];
  gross_pay: string;
  total_deductions: string;
  net_pay: string;
};

export type PayrollRun = {
  id: number;
  period: string;
  status: "draft" | "approved" | "paid";
  total_gross: string;
  total_deductions: string;
  total_net: string;
  employee_count: number;
  notes: string | null;
  created_at: string;
  computed_at: string | null;
};

export type PayrollRunDetail = PayrollRun & { payslips: Payslip[] };

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const detail = data?.detail;
  if (Array.isArray(detail)) {
    const msg = String(detail[0]?.msg ?? "Invalid value").replace(
      /^Value error,\s*/,
      "",
    );
    throw new ApiError(msg, res.status, {});
  }
  throw new ApiError(
    typeof detail === "string" ? detail : "Something went wrong",
    res.status,
  );
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { ...authHeaders(), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const getPayrollSettings = () =>
  fetch(`${API_URL}/payroll/settings`, { headers: authHeaders() }).then(
    handle<PayrollSettings>,
  );

export const savePayrollSettings = (p: PayrollSettingsPayload) =>
  fetch(`${API_URL}/payroll/settings`, json("PUT", p)).then(
    handle<PayrollSettings>,
  );

export const listComponents = () =>
  fetch(`${API_URL}/payroll/components`, { headers: authHeaders() }).then(
    handle<SalaryComponent[]>,
  );

export const createComponent = (p: Partial<SalaryComponent>) =>
  fetch(`${API_URL}/payroll/components`, json("POST", p)).then(
    handle<SalaryComponent>,
  );

export const updateComponent = (id: number, p: Partial<SalaryComponent>) =>
  fetch(`${API_URL}/payroll/components/${id}`, json("PUT", p)).then(
    handle<SalaryComponent>,
  );

export const deleteComponent = (id: number) =>
  fetch(`${API_URL}/payroll/components/${id}`, json("DELETE")).then(handle<void>);

export const listLeaveTypes = () =>
  fetch(`${API_URL}/payroll/leave-types`, { headers: authHeaders() }).then(
    handle<LeaveType[]>,
  );

export const createLeaveType = (p: Partial<LeaveType>) =>
  fetch(`${API_URL}/payroll/leave-types`, json("POST", p)).then(handle<LeaveType>);

export const updateLeaveType = (id: number, p: Partial<LeaveType>) =>
  fetch(`${API_URL}/payroll/leave-types/${id}`, json("PUT", p)).then(
    handle<LeaveType>,
  );

export const deleteLeaveType = (id: number) =>
  fetch(`${API_URL}/payroll/leave-types/${id}`, json("DELETE")).then(handle<void>);

export const listRuns = () =>
  fetch(`${API_URL}/payroll/runs`, { headers: authHeaders() }).then(
    handle<PayrollRun[]>,
  );

export const getRun = (id: number) =>
  fetch(`${API_URL}/payroll/runs/${id}`, { headers: authHeaders() }).then(
    handle<PayrollRunDetail>,
  );

export const createRun = (period: string, notes?: string) =>
  fetch(`${API_URL}/payroll/runs`, json("POST", { period, notes })).then(
    handle<PayrollRunDetail>,
  );

export const computeRun = (id: number) =>
  fetch(`${API_URL}/payroll/runs/${id}/compute`, json("POST")).then(
    handle<PayrollRunDetail>,
  );

export const setRunStatus = (id: number, status: string) =>
  fetch(`${API_URL}/payroll/runs/${id}/status`, json("PUT", { status })).then(
    handle<PayrollRun>,
  );

export const deleteRun = (id: number) =>
  fetch(`${API_URL}/payroll/runs/${id}`, json("DELETE")).then(handle<void>);

/** "₹1,23,456.00" — Indian grouping. */
export function rupees(value: string | number, decimals = 2) {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${y}`;
}

export { ApiError };

/* ------------------------------------------------------------------ *
 * Filters, reports and payslip templates
 * ------------------------------------------------------------------ */

export const PAYSLIP_TEMPLATES = [
  { value: "classic", label: "Classic", hint: "Two-column earnings and deductions grid." },
  { value: "modern", label: "Modern", hint: "Banded header with the net pay called out." },
  { value: "compact", label: "Compact", hint: "Single column, fits a short payslip." },
] as const;

export type PayslipTemplate = (typeof PAYSLIP_TEMPLATES)[number]["value"];

export type RunFilters = {
  date_from?: string;
  date_to?: string;
  status?: string;
};

export type PayslipFilters = {
  q?: string;
  department_id?: number;
  designation_id?: number;
  only_lop?: boolean;
  only_overtime?: boolean;
  min_net?: string;
  max_net?: string;
};

function qs(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === "all" || v === false) continue;
    search.set(k, String(v));
  }
  return search.toString();
}

export const listRunsFiltered = (f: RunFilters = {}) =>
  fetch(`${API_URL}/payroll/runs?${qs(f)}`, { headers: authHeaders() }).then(
    handle<PayrollRun[]>,
  );

export const listPayslips = (runId: number, f: PayslipFilters = {}) =>
  fetch(`${API_URL}/payroll/runs/${runId}/payslips?${qs(f)}`, {
    headers: authHeaders(),
  }).then(handle<Payslip[]>);

/** Fetches with auth, then hands the browser a blob to save. */
async function download(url: string, fallbackName: string) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(
      typeof data?.detail === "string" ? data.detail : "Download failed",
      res.status,
    );
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = match?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export const downloadReport = (
  runId: number,
  format: "csv" | "pdf",
  f: PayslipFilters = {},
) =>
  download(
    `${API_URL}/payroll/runs/${runId}/report.${format}?${qs(f)}`,
    `payroll.${format}`,
  );

export const downloadPayslip = (
  runId: number,
  employeeId: number,
  template?: string,
  layoutId?: number,
) =>
  download(
    `${API_URL}/payroll/runs/${runId}/payslips/${employeeId}/pdf?${qs({
      template,
      layout_id: layoutId,
    })}`,
    "payslip.pdf",
  );

/** Opens the payslip PDF in a new tab rather than saving it. */
export async function previewPayslip(
  runId: number,
  employeeId: number,
  template?: string,
  layoutId?: number,
) {
  const res = await fetch(
    `${API_URL}/payroll/runs/${runId}/payslips/${employeeId}/pdf?${qs({
      template,
      layout_id: layoutId,
    })}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new ApiError("Could not render the payslip", res.status);

  const href = URL.createObjectURL(await res.blob());
  window.open(href, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/* ------------------------------------------------------------------ *
 * Payslip layouts (the editor)
 * ------------------------------------------------------------------ */

export type PayslipOptions = {
  accent_color: string;
  title: string;
  show_logo: boolean;
  logo_source: "company" | "custom";
  logo_path: string | null;
  logo_height: number;
  logo_align: "left" | "center" | "right";
  show_company_address: boolean;
  show_employee_meta: boolean;
  show_attendance_stats: boolean;
  show_notes: boolean;
  show_leave_table: boolean;
  show_employer_contributions: boolean;
  show_net_in_words: boolean;
  show_signature: boolean;
  signature_label: string;
  footer_note: string;
  density: "comfortable" | "compact";
};

export type PayslipLayout = {
  id: number;
  name: string;
  base: PayslipTemplate;
  options: Partial<PayslipOptions>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_PAYSLIP_OPTIONS: PayslipOptions = {
  accent_color: "#072869",
  title: "Payslip",
  show_logo: true,
  logo_source: "company",
  logo_path: null,
  logo_height: 34,
  logo_align: "left",
  show_company_address: true,
  show_employee_meta: true,
  show_attendance_stats: true,
  show_notes: true,
  show_leave_table: true,
  show_employer_contributions: true,
  show_net_in_words: true,
  show_signature: false,
  signature_label: "Authorised Signatory",
  footer_note:
    "This is a computer-generated payslip and does not require a signature.",
  density: "comfortable",
};

export const listLayouts = () =>
  fetch(`${API_URL}/payroll/payslip-layouts`, { headers: authHeaders() }).then(
    handle<PayslipLayout[]>,
  );

export const createLayout = (p: Partial<PayslipLayout>) =>
  fetch(`${API_URL}/payroll/payslip-layouts`, json("POST", p)).then(
    handle<PayslipLayout>,
  );

export const updateLayout = (id: number, p: Partial<PayslipLayout>) =>
  fetch(`${API_URL}/payroll/payslip-layouts/${id}`, json("PUT", p)).then(
    handle<PayslipLayout>,
  );

export const deleteLayout = (id: number) =>
  fetch(`${API_URL}/payroll/payslip-layouts/${id}`, json("DELETE")).then(
    handle<void>,
  );

/** Upload a logo for a payslip design, separate from the company profile. */
export async function uploadPayslipLogo(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_URL}/payroll/payslip-layouts/logo`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  const data = await handle<{ logo_path: string }>(res);
  return data.logo_path;
}

export const previewLayout = (body: {
  base: string;
  options: Partial<PayslipOptions>;
  run_id?: number;
  employee_id?: number;
}) =>
  fetch(`${API_URL}/payroll/payslip-layouts/preview`, json("POST", body)).then(
    handle<{ html: string; sample: boolean }>,
  );

/* ------------------------------------------------------------------ *
 * One-off payroll inputs
 * ------------------------------------------------------------------ */

export const INPUT_KINDS = [
  { value: "bonus", label: "Bonus", side: "earning" },
  { value: "incentive", label: "Incentive", side: "earning" },
  { value: "reimbursement", label: "Reimbursement", side: "earning" },
  { value: "arrear", label: "Arrears", side: "earning" },
  { value: "overtime", label: "Overtime", side: "earning" },
  { value: "lop_reversal", label: "LOP reversal", side: "earning" },
  { value: "deduction", label: "Deduction", side: "deduction" },
] as const;

export type InputKind = (typeof INPUT_KINDS)[number]["value"];

export type PayrollInput = {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  period: string;
  kind: InputKind;
  label: string;
  amount: string;
  hours: string | null;
  reference_period: string | null;
  days: string | null;
  include_in_pf: boolean;
  include_in_esi: boolean;
  note: string | null;
  created_at: string;
};

export const listInputs = (p: { period?: string; employee_id?: number } = {}) =>
  fetch(`${API_URL}/payroll/inputs?${qs(p)}`, { headers: authHeaders() }).then(
    handle<PayrollInput[]>,
  );

export const createInput = (body: Partial<PayrollInput>) =>
  fetch(`${API_URL}/payroll/inputs`, json("POST", body)).then(
    handle<PayrollInput>,
  );

export const deleteInput = (id: number) =>
  fetch(`${API_URL}/payroll/inputs/${id}`, json("DELETE")).then(handle<void>);

export function inputSide(kind: string) {
  return INPUT_KINDS.find((k) => k.value === kind)?.side ?? "earning";
}
