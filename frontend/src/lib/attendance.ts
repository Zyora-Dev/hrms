import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half day" },
  { value: "absent", label: "Absent" },
  { value: "weekly_off", label: "Weekly off" },
  { value: "holiday", label: "Holiday" },
  { value: "on_leave", label: "On leave" },
  { value: "not_marked", label: "Not marked" },
] as const;

/** What an admin may set by hand; clearing hands the day back to the punches. */
export const MANUAL_STATUSES = [
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half day" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On leave" },
  { value: "holiday", label: "Holiday" },
] as const;

export type ManualStatus = (typeof MANUAL_STATUSES)[number]["value"];

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]["value"];

export type Punch = {
  id: number;
  employee_id: number;
  punch_at: string;
  direction: "in" | "out" | "auto";
  source: "biometric" | "manual" | "web" | "import";
  device_id: string | null;
  note: string | null;
};

export type AttendanceDay = {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  attendance_date: string;
  shift_id: number | null;
  shift_name: string | null;
  first_in: string | null;
  last_out: string | null;
  worked_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  early_exit_minutes: number;
  is_continued: boolean;
  continued_minutes: number;
  continued_shifts: string;
  continued_into_shift_id: number | null;
  continued_into_shift_name: string | null;
  status: AttendanceStatus;
  has_manual_punch: boolean;
  continuation_mode: ContinuationMode;
  continuation_override_minutes: number;
  continuation_note: string | null;
  status_override: AttendanceStatus | null;
  status_note: string | null;
  remarks: string | null;
  punches: Punch[];
};

export type ContinuationMode = "auto" | "forced" | "excluded";

export type MatrixCell = {
  day: number;
  status: AttendanceStatus | null;
  worked_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  is_continued: boolean;
  continuation_mode: ContinuationMode;
  shift_code: string | null;
};

export type MatrixRow = {
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  department: string | null;
  cells: MatrixCell[];
  present: string;
  absent: number;
  leave: number;
  off: number;
  worked_minutes: number;
  overtime_minutes: number;
  continued: number;
};

export type DayRosterEntry = {
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  department: string | null;
  shift_id: number | null;
  shift_name: string | null;
  shift_window: string | null;
  day: AttendanceDay | null;
  status: AttendanceStatus;
  is_overridden: boolean;
  punches: Punch[];
};

export type DayRoster = {
  attendance_date: string;
  is_closed: boolean;
  entries: DayRosterEntry[];
};

export type AttendanceMatrix = {
  month: string;
  days: number;
  rows: MatrixRow[];
};

export type AttendancePage = {
  items: AttendanceDay[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type AttendanceSummary = {
  employees: number;
  present: number;
  half_day: number;
  absent: number;
  weekly_off: number;
  continued: number;
  total_overtime_minutes: number;
};

export type IngestResult = {
  received: number;
  stored: number;
  duplicates: number;
  unmatched: string[];
  recomputed_days: number;
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

export type AttendanceQuery = {
  date_from?: string;
  date_to?: string;
  employee_id?: number;
  shift_id?: number;
  status?: string;
  continued_only?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
};

function toSearch(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === "all" || value === false) {
      continue;
    }
    search.set(key, String(value));
  }
  return search;
}

export async function listAttendance(
  params: AttendanceQuery = {},
): Promise<AttendancePage> {
  const res = await fetch(`${API_URL}/attendance?${toSearch(params)}`, {
    headers: authHeaders(),
  });
  return handle<AttendancePage>(res);
}

export async function getSummary(
  dateFrom: string,
  dateTo: string,
): Promise<AttendanceSummary> {
  const res = await fetch(
    `${API_URL}/attendance/summary?${toSearch({ date_from: dateFrom, date_to: dateTo })}`,
    { headers: authHeaders() },
  );
  return handle<AttendanceSummary>(res);
}

export async function addManualPunch(payload: {
  employee_id: number;
  punch_at: string;
  direction?: "in" | "out" | "auto";
  note?: string;
}): Promise<IngestResult> {
  const res = await fetch(`${API_URL}/attendance/punches/manual`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, source: "manual" }),
  });
  return handle<IngestResult>(res);
}

export async function deletePunch(id: number): Promise<IngestResult> {
  const res = await fetch(`${API_URL}/attendance/punches/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<IngestResult>(res);
}

export async function importPunches(file: File): Promise<IngestResult> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_URL}/attendance/punches/import`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return handle<IngestResult>(res);
}

export async function recompute(payload: {
  date_from: string;
  date_to: string;
  employee_id?: number;
}): Promise<{ days: number; employees: number }> {
  const res = await fetch(`${API_URL}/attendance/recompute`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<{ days: number; employees: number }>(res);
}

export async function setContinuation(
  dayId: number,
  payload: { mode: ContinuationMode; minutes?: number; note?: string | null },
): Promise<AttendanceDay> {
  const res = await fetch(`${API_URL}/attendance/days/${dayId}/continuation`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: payload.mode,
      minutes: payload.minutes ?? 0,
      note: payload.note || null,
    }),
  });
  return handle<AttendanceDay>(res);
}

/** "half a shift", "a full shift", "1.5 shifts" — hours alone say nothing. */
export function shiftSpan(shifts: string | number) {
  const n = Number(shifts);
  if (!n) return "";
  if (n >= 0.45 && n <= 0.55) return "half a shift";
  if (n >= 0.95 && n <= 1.05) return "a full shift";
  return `${Number(n.toFixed(2))} shifts`;
}

export async function loadDayRoster(params: {
  on: string;
  shift_id?: number;
  q?: string;
}): Promise<DayRoster> {
  const res = await fetch(`${API_URL}/attendance/day?${toSearch(params)}`, {
    headers: authHeaders(),
  });
  return handle<DayRoster>(res);
}

export async function setDayStatus(payload: {
  employee_id: number;
  attendance_date: string;
  status: ManualStatus | null;
  note?: string | null;
}): Promise<DayRosterEntry> {
  const res = await fetch(`${API_URL}/attendance/day/status`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, note: payload.note || null }),
  });
  return handle<DayRosterEntry>(res);
}

/** Wipes a day back to nothing — its punches, marks and totals. */
export async function clearDay(
  dayId: number,
  keepPunches = false,
): Promise<DayRosterEntry> {
  const res = await fetch(
    `${API_URL}/attendance/days/${dayId}?keep_punches=${keepPunches}`,
    { method: "DELETE", headers: authHeaders() },
  );
  return handle<DayRosterEntry>(res);
}

export async function loadMatrix(params: {
  month: string;
  shift_id?: number;
  q?: string;
}): Promise<AttendanceMatrix> {
  const res = await fetch(`${API_URL}/attendance/matrix?${toSearch(params)}`, {
    headers: authHeaders(),
  });
  return handle<AttendanceMatrix>(res);
}

/** Fetches with auth, then hands the browser a blob to save. */
export async function exportAttendance(params: AttendanceQuery = {}) {
  const res = await fetch(`${API_URL}/attendance/export.csv?${toSearch(params)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(
      typeof data?.detail === "string" ? data.detail : "Export failed",
      res.status,
    );
  }

  const match = /filename="?([^"]+)"?/.exec(
    res.headers.get("content-disposition") ?? "",
  );
  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = match?.[1] ?? "attendance.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

const STATUS_TONES: Record<string, string> = {
  present: "bg-primary/15 text-primary ring-primary/25",
  half_day: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  absent: "bg-destructive/15 text-destructive ring-destructive/25",
  weekly_off: "bg-muted text-muted-foreground ring-border",
  holiday: "bg-sky-500/15 text-sky-700 ring-sky-500/25",
  on_leave: "bg-violet-500/15 text-violet-700 ring-violet-500/25",
  not_marked: "bg-muted/60 text-muted-foreground ring-border/70",
};

export function statusTone(status: string) {
  return STATUS_TONES[status] ?? STATUS_TONES.absent;
}

export function statusLabel(status: string) {
  return ATTENDANCE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** Minutes to "8h 10m". */
export function hours(minutes: number) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Local clock time of an ISO timestamp, with a day marker when it rolls over. */
export function clock(iso: string | null, baseDate?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (baseDate) {
    const base = new Date(`${baseDate}T00:00:00`);
    const diff = Math.round(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
        base.getTime()) /
        86_400_000,
    );
    if (diff > 0) return `${hh}:${mm} +${diff}d`;
  }
  return `${hh}:${mm}`;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export { ApiError };
