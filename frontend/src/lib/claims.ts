import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type Claim = {
  id: number;
  reference: string;
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  category: string;
  title: string;
  description: string | null;
  spent_on: string;
  amount: string;
  approved_amount: string | null;
  receipt_path: string | null;
  settlement: "payroll" | "separate";
  status: "pending" | "approved" | "rejected" | "paid" | "cancelled";
  decision_note: string | null;
  decided_at: string | null;
  decided_by: string | null;
  paid_period: string | null;
  paid_on: string | null;
  created_at: string;
};

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  const detail = data?.detail;
  throw new ApiError(
    Array.isArray(detail)
      ? String(detail[0]?.msg ?? "Invalid value")
      : typeof detail === "string"
        ? detail
        : "Something went wrong",
    res.status,
  );
}

export const listClaims = (params: { status?: string; q?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  return fetch(`${API_URL}/claims?${qs}`, { headers: authHeaders() }).then(
    handle<Claim[]>,
  );
};

export const getClaim = (id: number) =>
  fetch(`${API_URL}/claims/${id}`, { headers: authHeaders() }).then(
    handle<Claim>,
  );

export const decideClaim = (
  id: number,
  body: {
    status: "approved" | "rejected";
    approved_amount?: string | null;
    settlement: "payroll" | "separate";
    note?: string | null;
  },
) =>
  fetch(`${API_URL}/claims/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle<Claim>);

export const payClaim = (id: number, period: string) =>
  fetch(`${API_URL}/claims/${id}/pay?period=${period}`, {
    method: "POST",
    headers: authHeaders(),
  }).then(handle<Claim>);

export { ApiError };
