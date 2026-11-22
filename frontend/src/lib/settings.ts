import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export const PAYROLL_BASES = [
  {
    value: "shift_hours",
    label: "Shift hours",
    hint: "Pay follows hours actually worked against the assigned shift. Overnight and continued shifts count in full.",
  },
  {
    value: "working_days",
    label: "Working days",
    hint: "Pay follows days present, excluding weekly offs and holidays.",
  },
  {
    value: "calendar_days",
    label: "Calendar days",
    hint: "Pay follows every day in the month, including offs.",
  },
] as const;

export type PayrollBasis = (typeof PAYROLL_BASES)[number]["value"];

export type AttendanceSettings = {
  id: number;
  payroll_basis: PayrollBasis;
  standard_monthly_days: number;
  round_punch_minutes: number;
  overtime_enabled: boolean;
  overtime_min_minutes: number;
  overtime_max_minutes_per_day: number;
  overtime_multiplier: string;
  continuation_counts_as_overtime: boolean;
  auto_absent_without_punch: boolean;
  allow_manual_punch: boolean;
  manual_punch_requires_reason: boolean;
  week_starts_on: number;
  updated_at: string;
};

export type AttendanceSettingsPayload = Omit<
  AttendanceSettings,
  "id" | "updated_at"
>;

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
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

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const res = await fetch(`${API_URL}/settings/attendance`, {
    headers: authHeaders(),
  });
  return handle<AttendanceSettings>(res);
}

export async function saveAttendanceSettings(
  payload: AttendanceSettingsPayload,
): Promise<AttendanceSettings> {
  const res = await fetch(`${API_URL}/settings/attendance`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<AttendanceSettings>(res);
}

export { ApiError };
