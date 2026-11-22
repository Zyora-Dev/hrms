import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type AttendanceReportRow = {
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  department: string | null;
  present: number;
  half_day: number;
  absent: number;
  on_leave: number;
  weekly_off: number;
  holiday: number;
  not_marked: number;
  payable_days: string;
  worked_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  late_days: number;
  continued_days: number;
};

export type AttendanceReport = {
  date_from: string;
  date_to: string;
  rows: AttendanceReportRow[];
  employees: number;
  present: number;
  absent: number;
  on_leave: number;
  worked_minutes: number;
  overtime_minutes: number;
};

export type PayrollReportRow = {
  period: string;
  status: string;
  employees: number;
  gross: string;
  deductions: string;
  net: string;
  pf: string;
  employer_pf: string;
  esi: string;
  employer_esi: string;
  pt: string;
  tds: string;
  lop_days: string;
  overtime_minutes: number;
};

export type PayrollReport = {
  date_from: string;
  date_to: string;
  rows: PayrollReportRow[];
  gross: string;
  deductions: string;
  net: string;
  employer_cost: string;
};

export type StatutoryRow = {
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  uan: string | null;
  esic_number: string | null;
  pan: string | null;
  gross: string;
  pf_employee: string;
  pf_employer: string;
  esi_employee: string;
  esi_employer: string;
  pt: string;
  tds: string;
};

export type StatutoryReport = {
  period: string;
  rows: StatutoryRow[];
  pf_total: string;
  esi_total: string;
  pt_total: string;
  tds_total: string;
};

export type LeaveReportRow = {
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  department: string | null;
  leave_type: string;
  taken: string;
  balance: string;
  pending: string;
};

export type LeaveReport = {
  year: number;
  rows: LeaveReportRow[];
  taken: string;
  balance: string;
};

export type HeadcountMonth = {
  period: string;
  opening: number;
  joined: number;
  left: number;
  closing: number;
  attrition_percent: number;
};

export type HeadcountReport = {
  date_from: string;
  date_to: string;
  months: HeadcountMonth[];
  departments: Record<string, number>;
  joined: number;
  left: number;
  closing: number;
};

export type OutstandingRow = {
  kind: "loan" | "advance";
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  reference: string | null;
  principal: string;
  recovered: string;
  outstanding: string;
  started: string | null;
  note: string | null;
};

export type OutstandingReport = {
  rows: OutstandingRow[];
  loans: string;
  advances: string;
};

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  throw new ApiError(
    typeof data?.detail === "string" ? data.detail : "Could not build the report",
    res.status,
  );
}

function qs(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

const get = <T,>(path: string, params: Record<string, unknown>) =>
  fetch(`${API_URL}/reports/${path}?${qs(params)}`, {
    headers: authHeaders(),
  }).then(handle<T>);

export const attendanceReport = (p: {
  date_from: string;
  date_to: string;
  department_id?: number | string;
  q?: string;
}) => get<AttendanceReport>("attendance", p);

export const payrollReport = (p: {
  date_from: string;
  date_to: string;
  department_id?: number | string;
}) => get<PayrollReport>("payroll", p);

export const statutoryReport = (p: {
  period: string;
  department_id?: number | string;
}) => get<StatutoryReport>("statutory", p);

export const leaveReport = (p: {
  year: number;
  department_id?: number | string;
  q?: string;
}) => get<LeaveReport>("leave", p);

export const headcountReport = (p: {
  date_from: string;
  date_to: string;
  department_id?: number | string;
}) => get<HeadcountReport>("headcount", p);

export const outstandingReport = (p: { department_id?: number | string }) =>
  get<OutstandingReport>("outstanding", p);

/** Fetches with auth, then hands the browser a blob to save. */
export async function downloadReport(
  name: string,
  params: Record<string, unknown>,
) {
  const res = await fetch(`${API_URL}/reports/${name}.csv?${qs(params)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new ApiError("Export failed", res.status);

  const match = /filename="?([^"]+)"?/.exec(
    res.headers.get("content-disposition") ?? "",
  );
  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = match?.[1] ?? `${name}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export { ApiError };
