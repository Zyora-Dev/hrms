import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export const LEAVE_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number]["value"];

export type LeaveRequest = {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  leave_type_id: number;
  leave_type_name: string | null;
  leave_type_code: string | null;
  is_paid: boolean;
  start_date: string;
  end_date: string;
  days: string;
  is_half_day: boolean;
  reason: string | null;
  status: LeaveStatus;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export type LeaveRequestPage = {
  items: LeaveRequest[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type LeaveBalance = {
  leave_type_id: number;
  code: string;
  name: string;
  entitled: string;
  used: string;
  pending: string;
  available: string;
  carry_forward: boolean;
  encash_unused: boolean;
};

export type EmployeeLeaveBalances = {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  period: string;
  balances: LeaveBalance[];
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

function qs(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === "all" || v === false) continue;
    search.set(k, String(v));
  }
  return search.toString();
}

export const listLeaveRequests = (p: {
  employee_id?: number;
  leave_type_id?: number;
  status?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
  page?: number;
  page_size?: number;
} = {}) =>
  fetch(`${API_URL}/leave/requests?${qs(p)}`, { headers: authHeaders() }).then(
    handle<LeaveRequestPage>,
  );

export const createLeaveRequest = (body: {
  employee_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  is_half_day?: boolean;
  reason?: string;
}) =>
  fetch(`${API_URL}/leave/requests`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle<LeaveRequest>);

export const getLeaveRequest = (id: number) =>
  fetch(`${API_URL}/leave/requests/${id}`, { headers: authHeaders() }).then(
    handle<LeaveRequest>,
  );

export const decideLeaveRequest = (
  id: number,
  status: string,
  decision_note?: string,
) =>
  fetch(`${API_URL}/leave/requests/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ status, decision_note }),
  }).then(handle<LeaveRequest>);

export const deleteLeaveRequest = (id: number) =>
  fetch(`${API_URL}/leave/requests/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handle<void>);

export const listLeaveBalances = (p: { employee_id?: number; as_of?: string; q?: string } = {}) =>
  fetch(`${API_URL}/leave/balances?${qs(p)}`, { headers: authHeaders() }).then(
    handle<EmployeeLeaveBalances[]>,
  );

const TONES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  approved: "bg-primary/15 text-primary ring-primary/25",
  rejected: "bg-destructive/15 text-destructive ring-destructive/25",
  cancelled: "bg-muted text-muted-foreground ring-border",
};

export function leaveTone(status: string) {
  return TONES[status] ?? TONES.cancelled;
}

export { ApiError };
