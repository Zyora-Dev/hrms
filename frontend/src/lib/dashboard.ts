import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type Headcount = {
  active: number;
  joined_this_month: number;
  exits_this_month: number;
  on_probation: number;
};

export type AttendanceToday = {
  present: number;
  half_day: number;
  absent: number;
  weekly_off: number;
  holiday: number;
  on_leave: number;
  late: number;
  overtime_hours: number;
  not_marked: number;
  expected: number;
  rate: number;
};

export type TrendPoint = {
  date: string;
  present: number;
  half_day: number;
  absent: number;
  on_leave: number;
  weekly_off: number;
  holiday: number;
  rate: number;
};

export type DepartmentSlice = { name: string; count: number; pct: number };

export type ShiftCoverage = {
  shift_id: number;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  assigned: number;
  present: number;
  pct: number;
};

export type PendingLeave = {
  id: number;
  employee_name: string | null;
  employee_code: string | null;
  leave_type: string | null;
  start_date: string;
  end_date: string;
  days: string;
  applied_on: string;
  starts_in_days: number;
};

export type PayrollBlock = {
  period: string | null;
  status: string | null;
  total_net: string;
  total_gross: string;
  employee_count: number;
  change_pct: number | null;
};

export type UpcomingHoliday = {
  name: string;
  holiday_date: string;
  kind: string;
  days_away: number;
};

export type Joiner = {
  id: number;
  name: string | null;
  employee_code: string | null;
  department: string | null;
  date_of_joining: string;
  days_ago: number;
};

export type Celebration = {
  employee_id: number;
  name: string | null;
  employee_code: string | null;
  kind: "birthday" | "anniversary";
  on_date: string;
  years: number | null;
};

export type PunchFeedItem = {
  id: number;
  employee_name: string | null;
  employee_code: string | null;
  punch_at: string;
  direction: string;
  source: string;
};

export type Dashboard = {
  today: string;
  headcount: Headcount;
  attendance: AttendanceToday;
  trend: TrendPoint[];
  departments: DepartmentSlice[];
  shifts: ShiftCoverage[];
  leave: { pending_count: number; pending: PendingLeave[] };
  payroll: PayrollBlock;
  holidays: UpcomingHoliday[];
  joiners: Joiner[];
  celebrations: Celebration[];
  punches: PunchFeedItem[];
  without_salary: number;
};

export const loadDashboard = () =>
  fetch(`${API_URL}/dashboard`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  }).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (res.ok) return data as Dashboard;
    throw new ApiError(
      typeof data?.detail === "string" ? data.detail : "Could not load dashboard",
      res.status,
    );
  });
