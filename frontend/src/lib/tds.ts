import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type TdsChallan = {
  id: number;
  period: string;
  deposit_date: string;
  bsr_code: string;
  challan_serial: string;
  section: string;
  mode: "online" | "offline";
  tds_amount: string;
  surcharge: string;
  education_cess: string;
  interest: string;
  late_fee: string;
  total_amount: string;
  note: string | null;
  cin: string;
  financial_year: string;
  quarter: number;
  due_date: string | null;
  is_late: boolean;
  created_at: string;
};

export type TdsMonthRow = {
  period: string;
  deducted: string;
  deposited: string;
  difference: string;
  employees: number;
  challans: number;
  due_date: string;
  is_late: boolean;
  status: "matched" | "short" | "excess" | "not_deposited" | "nothing_due";
};

export type TdsReconciliation = {
  financial_year: string;
  quarter: number | null;
  return_due_date: string | null;
  total_deducted: string;
  total_deposited: string;
  difference: string;
  months: TdsMonthRow[];
};

export type TdsDeductee = {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  pan: string | null;
  amount: string;
  months: number;
};

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

function qs(p: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === "" || v === "all") continue;
    s.set(k, String(v));
  }
  return s.toString();
}

export const listChallans = (p: { financial_year?: number; quarter?: number } = {}) =>
  fetch(`${API_URL}/tds/challans?${qs(p)}`, { headers: authHeaders() }).then(
    handle<TdsChallan[]>,
  );

export const createChallan = (body: Partial<TdsChallan>) =>
  fetch(`${API_URL}/tds/challans`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle<TdsChallan>);

export const deleteChallan = (id: number) =>
  fetch(`${API_URL}/tds/challans/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handle<void>);

export const getReconciliation = (p: { financial_year?: number; quarter?: number } = {}) =>
  fetch(`${API_URL}/tds/reconciliation?${qs(p)}`, { headers: authHeaders() }).then(
    handle<TdsReconciliation>,
  );

export const listDeductees = (p: { financial_year?: number; quarter?: number } = {}) =>
  fetch(`${API_URL}/tds/deductees?${qs(p)}`, { headers: authHeaders() }).then(
    handle<TdsDeductee[]>,
  );

const STATUS: Record<string, { label: string; tone: string }> = {
  matched: { label: "Matched", tone: "bg-primary/15 text-primary ring-primary/25" },
  short: {
    label: "Short",
    tone: "bg-destructive/15 text-destructive ring-destructive/25",
  },
  excess: { label: "Excess", tone: "bg-sky-500/15 text-sky-700 ring-sky-500/25" },
  not_deposited: {
    label: "Not deposited",
    tone: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  },
  nothing_due: {
    label: "Nothing due",
    tone: "bg-muted text-muted-foreground ring-border",
  },
};

/** Fetches with auth, then hands the browser the quarter's return to save. */
export async function downloadForm138(year: number, quarter: number) {
  const res = await fetch(
    `${API_URL}/tds/form138?financial_year=${year}&quarter=${quarter}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(
      typeof data?.detail === "string" ? data.detail : "Could not build it",
      res.status,
    );
  }

  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = `form138-${fyLabel(year)}-Q${quarter}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function tdsStatus(key: string) {
  return STATUS[key] ?? STATUS.nothing_due;
}

/** Indian FY starting year for a date. */
export function currentFy() {
  const d = new Date();
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyLabel(start: number) {
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function monthName(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]} ${y}`;
}

export { ApiError };
