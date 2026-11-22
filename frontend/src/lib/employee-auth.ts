import { API_URL } from "./auth";

/** Its own key, so an employee and an admin can be signed in side by side. */
const TOKEN_KEY = "hrms_employee_token";

export type EmployeeMe = {
  id: number;
  employee_code: string;
  full_name: string | null;
  work_email: string | null;
  designation: string | null;
  department: string | null;
  date_of_joining: string;
  photo_path: string | null;
  must_change_password: boolean;
};

export function storeEmployeeToken(token: string, remember = true) {
  if (typeof window === "undefined") return;
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export function getEmployeeToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? null
  );
}

export function clearEmployeeToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function message(data: unknown, fallback: string) {
  const detail = (data as { detail?: unknown })?.detail;
  if (Array.isArray(detail)) {
    return String((detail[0] as { msg?: string })?.msg ?? fallback);
  }
  return typeof detail === "string" ? detail : fallback;
}

export async function employeeLogin(employeeCode: string, password: string) {
  const res = await fetch(`${API_URL}/employee/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_code: employeeCode, password }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(message(data, "Invalid employee ID or password"));
  }
  return data as { access_token: string; expires_at: string };
}

export async function employeeMe(): Promise<EmployeeMe | null> {
  const token = getEmployeeToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/employee/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as EmployeeMe;
  } catch {
    return null;
  }
}

export async function employeeChangePassword(
  current_password: string,
  new_password: string,
) {
  const res = await fetch(`${API_URL}/employee/password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getEmployeeToken()}`,
    },
    body: JSON.stringify({ current_password, new_password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(message(data, "Could not change your password"));
  }
}

export async function employeeLogout() {
  const token = getEmployeeToken();
  if (token) {
    await fetch(`${API_URL}/employee/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearEmployeeToken();
}

/* ------------------------------------------------------------------ */
/* My records                                                          */
/* ------------------------------------------------------------------ */

export type MyAttendanceDay = {
  attendance_date: string;
  status: string;
  shift_name: string | null;
  first_in: string | null;
  last_out: string | null;
  worked_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  is_continued: boolean;
};

export type MyAttendanceMonth = {
  month: string;
  days: MyAttendanceDay[];
  present: string;
  absent: number;
  on_leave: number;
  weekly_off: number;
  holiday: number;
  worked_minutes: number;
  overtime_minutes: number;
  late_days: number;
};

export type MyLeaveBalance = {
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

export type MyLeaveRequest = {
  id: number;
  leave_type_id: number;
  leave_type_name: string | null;
  leave_type_code: string | null;
  start_date: string;
  end_date: string;
  days: string;
  is_half_day: boolean;
  reason: string | null;
  status: string;
  decision_note: string | null;
  created_at: string;
};

export type MyLeaveType = { id: number; name: string; code: string };

export type MyPayslip = {
  run_id: number;
  period: string;
  status: string;
  gross_pay: string;
  total_deductions: string;
  net_pay: string;
  lop_days: string;
  payable_days: string;
  earnings: { code: string; name: string; amount: string }[];
  deductions: { code: string; name: string; amount: string }[];
};

export type MyDocument = {
  id: number;
  kind: string;
  title: string;
  file_path: string;
  uploaded_at: string | null;
};

export type MyClaim = {
  id: number;
  reference: string;
  category: string;
  title: string;
  description: string | null;
  spent_on: string;
  amount: string;
  approved_amount: string | null;
  receipt_path: string | null;
  settlement: string;
  status: string;
  decision_note: string | null;
  paid_period: string | null;
  created_at: string;
};

export const CLAIM_CATEGORIES = [
  "travel",
  "food",
  "accommodation",
  "fuel",
  "phone",
  "medical",
  "equipment",
  "training",
  "other",
] as const;

function headers(): HeadersInit {
  const token = getEmployeeToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/employee${path}`, { headers: headers() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(message(data, "Could not load"));
  return data as T;
}

export const myAttendance = (month: string) =>
  get<MyAttendanceMonth>(`/attendance?month=${month}`);
export const myLeaveBalances = () => get<MyLeaveBalance[]>("/leave/balances");
export const myLeaveTypes = () => get<MyLeaveType[]>("/leave/types");
export const myLeaveRequests = () => get<MyLeaveRequest[]>("/leave/requests");
export const myPayslips = () => get<MyPayslip[]>("/payslips");
export const myDocuments = () => get<MyDocument[]>("/documents");
export const myClaims = () => get<MyClaim[]>("/claims");

export async function applyForLeave(body: {
  leave_type_id: number;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  reason: string | null;
}) {
  const res = await fetch(`${API_URL}/employee/leave/requests`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(message(data, "Could not apply"));
  return data as MyLeaveRequest;
}

export async function withdrawLeave(id: number) {
  const res = await fetch(`${API_URL}/employee/leave/requests/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(message(await res.json().catch(() => null), "Could not withdraw"));
  }
}

export async function raiseClaim(form: FormData) {
  const res = await fetch(`${API_URL}/employee/claims`, {
    method: "POST",
    headers: headers(),
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(message(data, "Could not raise the claim"));
  return data as MyClaim;
}

export async function withdrawClaim(id: number) {
  const res = await fetch(`${API_URL}/employee/claims/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(message(await res.json().catch(() => null), "Could not withdraw"));
  }
}

/** Fetches with auth, then hands the browser a blob to save. */
export async function downloadPayslip(runId: number, period: string) {
  const res = await fetch(`${API_URL}/employee/payslips/${runId}/pdf`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error("Payslip is not available");

  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = `payslip-${period.slice(0, 7)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export type MyProfile = {
  id: number;
  employee_code: string;
  full_name: string | null;
  photo_path: string | null;
  status: string;
  gender: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  marital_status: string | null;
  work_email: string | null;
  personal_email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  current_address: string | null;
  permanent_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  designation: string | null;
  department: string | null;
  employment_type: string | null;
  work_location: string | null;
  date_of_joining: string;
  probation_end_date: string | null;
  reporting_manager: string | null;
  shift_name: string | null;
  pan: string | null;
  aadhaar_masked: string | null;
  uan: string | null;
  pf_number: string | null;
  esic_number: string | null;
  bank_name: string | null;
  bank_account_masked: string | null;
  bank_ifsc: string | null;
  last_login_at: string | null;
};

export const myProfile = () => get<MyProfile>("/profile");

/* ------------------------------------------------------------------ */
/* Devices, notifications, holidays, corrections and forms             */
/* ------------------------------------------------------------------ */

export type MySession = {
  id: number;
  device: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  is_current: boolean;
};

export type MyNotification = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

export type MyHoliday = {
  name: string;
  holiday_date: string;
  kind: string;
  weekday: string;
  is_past: boolean;
};

export type MyRegularisation = {
  id: number;
  attendance_date: string;
  current_status: string | null;
  requested_status: string | null;
  requested_in: string | null;
  requested_out: string | null;
  reason: string;
  status: string;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export type MyFormYear = {
  year: number;
  label: string;
  gross: string;
  tds: string;
  months: number;
};

export const mySessions = () => get<MySession[]>("/sessions");
export const myNotifications = () => get<MyNotification[]>("/notifications");
export const myUnread = () => get<{ unread: number }>("/notifications/unread");
export const myHolidays = (year: number) =>
  get<MyHoliday[]>(`/holidays?year=${year}`);
export const myRegularisations = () =>
  get<MyRegularisation[]>("/regularisations");
export const myFormYears = () => get<MyFormYear[]>("/forms/years");

async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(`${API_URL}/employee${path}`, {
    method,
    headers: {
      ...headers(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    throw new Error(message(await res.json().catch(() => null), "That did not work"));
  }
  return res.status === 204 ? null : await res.json().catch(() => null);
}

export const revokeMySession = (id: number) => send(`/sessions/${id}`, "DELETE");
export const revokeMyOtherSessions = () =>
  send("/sessions/revoke-others", "POST");
export const readAllMine = () => send("/notifications/read-all", "POST");
export const withdrawRegularisation = (id: number) =>
  send(`/regularisations/${id}`, "DELETE");

export const requestRegularisation = (body: {
  attendance_date: string;
  requested_status: string | null;
  requested_in: string | null;
  requested_out: string | null;
  reason: string;
}) => send("/regularisations", "POST", body) as Promise<MyRegularisation>;

/** Fetches with auth, then hands the browser a blob to save. */
export async function downloadForm130(year: number, label: string) {
  const res = await fetch(
    `${API_URL}/employee/forms/form130?year=${year}`,
    { headers: headers() },
  );
  if (!res.ok) {
    throw new Error(
      message(await res.json().catch(() => null), "Not available yet"),
    );
  }
  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = `form130-${label}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
