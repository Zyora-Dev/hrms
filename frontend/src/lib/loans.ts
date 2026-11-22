import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export const LOAN_KINDS = [
  { value: "advance", label: "Salary advance", hint: "Usually interest-free, recovered over a few months." },
  { value: "loan", label: "Loan", hint: "Longer tenure, often with interest." },
] as const;

export const INTEREST_METHODS = [
  { value: "none", label: "No interest", hint: "Principal split evenly." },
  { value: "flat", label: "Flat", hint: "Interest on the original principal for the whole tenure." },
  { value: "reducing", label: "Reducing balance", hint: "Interest on the outstanding balance each month." },
] as const;

export type LoanKind = (typeof LOAN_KINDS)[number]["value"];
export type InterestMethod = (typeof INTEREST_METHODS)[number]["value"];

export type LoanInstalment = {
  id: number;
  seq: number;
  due_period: string;
  principal_part: string;
  interest_part: string;
  amount: string;
  status: "pending" | "paid" | "skipped" | "waived";
  paid_in_run_id: number | null;
};

export type Loan = {
  id: number;
  reference: string;
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  kind: LoanKind;
  principal: string;
  interest_rate: string;
  interest_method: InterestMethod;
  instalments: number;
  start_period: string;
  status: "active" | "closed" | "on_hold";
  purpose: string | null;
  note: string | null;
  created_at: string;
  total_payable: string;
  paid_amount: string;
  outstanding: string;
  paid_instalments: number;
  next_due: string | null;
  emi: string;
};

export type LoanDetail = Loan & { schedule: LoanInstalment[] };

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

export const listLoans = (p: { status?: string; employee_id?: number } = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === "" || v === "all") continue;
    qs.set(k, String(v));
  }
  return fetch(`${API_URL}/loans?${qs}`, { headers: authHeaders() }).then(
    handle<Loan[]>,
  );
};

export const getLoan = (id: number) =>
  fetch(`${API_URL}/loans/${id}`, { headers: authHeaders() }).then(
    handle<LoanDetail>,
  );

export const createLoan = (body: Record<string, unknown>) =>
  fetch(`${API_URL}/loans`, json("POST", body)).then(handle<LoanDetail>);

export const loanAction = (id: number, action: string, note?: string) =>
  fetch(`${API_URL}/loans/${id}/actions`, json("POST", { action, note })).then(
    handle<LoanDetail>,
  );

export const skipInstalment = (id: number, seq: number) =>
  fetch(`${API_URL}/loans/${id}/instalments/${seq}/skip`, json("POST")).then(
    handle<LoanDetail>,
  );

export const deleteLoan = (id: number) =>
  fetch(`${API_URL}/loans/${id}`, json("DELETE")).then(handle<void>);

const TONES: Record<string, string> = {
  active: "bg-primary/15 text-primary ring-primary/25",
  on_hold: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  closed: "bg-muted text-muted-foreground ring-border",
};

export function loanTone(status: string) {
  return TONES[status] ?? TONES.closed;
}

const INSTALMENT_TONES: Record<string, string> = {
  paid: "text-primary",
  pending: "text-muted-foreground",
  skipped: "text-amber-700",
  waived: "text-muted-foreground line-through",
};

export function instalmentTone(status: string) {
  return INSTALMENT_TONES[status] ?? "";
}

/* ---------------- statutory bonus ---------------- */

export type BonusRow = {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  months: number;
  days_worked: string;
  wage_total: string;
  capped_wage_total: string;
  rate: string;
  amount: string;
  eligible: boolean;
  reason: string | null;
};

export type BonusPreview = {
  financial_year: string;
  rate: string;
  basis: string;
  eligibility_ceiling: string;
  calculation_ceiling: string;
  total: string;
  eligible_count: number;
  rows: BonusRow[];
};

export const previewBonus = (p: { financial_year: number; rate?: string }) => {
  const qs = new URLSearchParams({ financial_year: String(p.financial_year) });
  if (p.rate) qs.set("rate", p.rate);
  return fetch(`${API_URL}/payroll/statutory-bonus?${qs}`, {
    headers: authHeaders(),
  }).then(handle<BonusPreview>);
};

export const applyBonus = (body: {
  financial_year: number;
  period: string;
  rate?: string;
  label?: string;
}) =>
  fetch(`${API_URL}/payroll/statutory-bonus/apply`, json("POST", body)).then(
    handle<unknown[]>,
  );

export { ApiError };
