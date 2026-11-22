import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export const WEEKDAYS = [
  { value: 0, short: "Mon", label: "Monday" },
  { value: 1, short: "Tue", label: "Tuesday" },
  { value: 2, short: "Wed", label: "Wednesday" },
  { value: 3, short: "Thu", label: "Thursday" },
  { value: 4, short: "Fri", label: "Friday" },
  { value: 5, short: "Sat", label: "Saturday" },
  { value: 6, short: "Sun", label: "Sunday" },
] as const;

export type Shift = {
  id: number;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_in_minutes: number;
  grace_out_minutes: number;
  full_day_minutes: number | null;
  half_day_minutes: number | null;
  max_continuation_shifts: string;
  continuation_window_minutes: number;
  early_in_hours: number;
  weekly_offs: number[];
  is_active: boolean;
  is_overnight: boolean;
  duration_minutes: number;
  paid_minutes: number;
  assigned_count: number;
};

export type ShiftPayload = Omit<
  Shift,
  | "id"
  | "is_overnight"
  | "duration_minutes"
  | "paid_minutes"
  | "continuation_window_minutes"
  | "assigned_count"
>;

export type ShiftAssignment = {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  shift_id: number;
  shift_name: string | null;
  effective_from: string;
  effective_to: string | null;
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

export async function listShifts(includeInactive = false): Promise<Shift[]> {
  const qs = includeInactive ? "?include_inactive=true" : "";
  const res = await fetch(`${API_URL}/shifts${qs}`, { headers: authHeaders() });
  return handle<Shift[]>(res);
}

export async function createShift(payload: ShiftPayload): Promise<Shift> {
  const res = await fetch(`${API_URL}/shifts`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<Shift>(res);
}

export async function updateShift(
  id: number,
  payload: ShiftPayload,
): Promise<Shift> {
  const res = await fetch(`${API_URL}/shifts/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<Shift>(res);
}

export async function deleteShift(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/shifts/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<void>(res);
}

export async function listAssignments(
  shiftId: number,
): Promise<ShiftAssignment[]> {
  const res = await fetch(`${API_URL}/shifts/${shiftId}/assignments`, {
    headers: authHeaders(),
  });
  return handle<ShiftAssignment[]>(res);
}

export async function assignShift(payload: {
  employee_ids: number[];
  shift_id: number;
  effective_from: string;
  effective_to?: string | null;
}): Promise<ShiftAssignment[]> {
  const res = await fetch(`${API_URL}/shifts/assignments`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<ShiftAssignment[]>(res);
}

export async function deleteAssignment(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/shifts/assignments/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<void>(res);
}

/** "09:00" from "09:00:00". */
export function hhmm(value: string) {
  return value.slice(0, 5);
}

/** 480 -> "8h 0m" */
export function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  // A generous continuation allowance runs past a day; "54h" reads worse
  // than "2d 6h".
  if (h >= 48) {
    const d = Math.floor(h / 24);
    const rest = h % 24;
    return rest ? `${d}d ${rest}h` : `${d}d`;
  }
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function emptyShift(): ShiftPayload {
  return {
    name: "",
    code: "",
    start_time: "09:00",
    end_time: "18:00",
    break_minutes: 60,
    grace_in_minutes: 10,
    grace_out_minutes: 10,
    full_day_minutes: null,
    half_day_minutes: null,
    max_continuation_shifts: "1",
    early_in_hours: 4,
    weekly_offs: [6],
    is_active: true,
  };
}

export { ApiError };

/* ------------------------------------------------------------------ *
 * Roster (rotation chart) and assignment history
 * ------------------------------------------------------------------ */

export type RosterShift = {
  id: number;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
};

export type RosterEmployee = {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  department: string | null;
  designation: string | null;
  days: Record<string, number | null>;
  offs: string[];
};

export type Roster = {
  date_from: string;
  date_to: string;
  dates: string[];
  shifts: RosterShift[];
  employees: RosterEmployee[];
  total: number;
};

export type AssignmentHistoryItem = {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  shift_id: number;
  shift_name: string;
  shift_code: string;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
};

export type AssignmentHistoryPage = {
  items: AssignmentHistoryItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

function search(params: Record<string, unknown>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === "all" || v === false) continue;
    qs.set(k, String(v));
  }
  return qs;
}

export async function getRoster(params: {
  date_from: string;
  date_to: string;
  shift_id?: number;
  department_id?: number;
  q?: string;
}): Promise<Roster> {
  const res = await fetch(`${API_URL}/shifts/roster?${search(params)}`, {
    headers: authHeaders(),
  });
  return handle<Roster>(res);
}

export async function getAssignmentHistory(params: {
  employee_id?: number;
  shift_id?: number;
  date_from?: string;
  date_to?: string;
  current_only?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<AssignmentHistoryPage> {
  const res = await fetch(
    `${API_URL}/shifts/assignments/history?${search(params)}`,
    { headers: authHeaders() },
  );
  return handle<AssignmentHistoryPage>(res);
}

/** Stable colour per shift so a rotation reads at a glance. */
const SHIFT_TONES = [
  "bg-brand-ink text-white",
  "bg-primary/20 text-brand-ink ring-1 ring-inset ring-primary/30",
  "bg-amber-500/20 text-amber-800 ring-1 ring-inset ring-amber-500/30",
  "bg-violet-500/20 text-violet-800 ring-1 ring-inset ring-violet-500/30",
  "bg-emerald-500/20 text-emerald-800 ring-1 ring-inset ring-emerald-500/30",
  "bg-sky-500/20 text-sky-800 ring-1 ring-inset ring-sky-500/30",
];

export function shiftTone(shiftId: number, order: number[]) {
  const index = order.indexOf(shiftId);
  return SHIFT_TONES[(index < 0 ? 0 : index) % SHIFT_TONES.length];
}
