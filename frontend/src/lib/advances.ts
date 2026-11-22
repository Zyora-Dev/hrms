import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type SalaryAdvance = {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  period: string;
  percent: string | null;
  amount: string;
  salary_basis: string;
  paid_on: string | null;
  payment_mode: string;
  reference: string | null;
  status: "pending" | "paid" | "recovered" | "cancelled";
  recovered_in_run_id: number | null;
  note: string | null;
  created_at: string;
  percent_of_salary: string;
};

export type AdvanceEligibility = {
  employee_id: number;
  period: string;
  monthly_salary: string;
  basis: string;
  default_percent: string;
  max_percent: string;
  max_amount: string;
  already_taken: string;
  available: string;
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

const json = (method: string, body?: unknown) => ({
  method,
  headers: { ...authHeaders(), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const listAdvances = (p: { period?: string; status?: string } = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === "" || v === "all") continue;
    qs.set(k, String(v));
  }
  return fetch(`${API_URL}/advances?${qs}`, { headers: authHeaders() }).then(
    handle<SalaryAdvance[]>,
  );
};

export const getEligibility = (employeeId: number, period: string) =>
  fetch(
    `${API_URL}/advances/eligibility?employee_id=${employeeId}&period=${period}`,
    { headers: authHeaders() },
  ).then(handle<AdvanceEligibility>);

export const createAdvance = (body: Record<string, unknown>) =>
  fetch(`${API_URL}/advances`, json("POST", body)).then(handle<SalaryAdvance>);

export const advanceAction = (
  id: number,
  action: string,
  extra: Record<string, unknown> = {},
) =>
  fetch(`${API_URL}/advances/${id}/actions`, json("POST", { action, ...extra })).then(
    handle<SalaryAdvance>,
  );

export const deleteAdvance = (id: number) =>
  fetch(`${API_URL}/advances/${id}`, json("DELETE")).then(handle<void>);

const TONES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  paid: "bg-sky-500/15 text-sky-700 ring-sky-500/25",
  recovered: "bg-primary/15 text-primary ring-primary/25",
  cancelled: "bg-muted text-muted-foreground ring-border",
};

export function advanceTone(status: string) {
  return TONES[status] ?? TONES.cancelled;
}

export { ApiError };
