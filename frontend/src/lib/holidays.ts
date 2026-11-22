import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export const HOLIDAY_KINDS = [
  { value: "public", label: "Public", hint: "Statutory or national holiday." },
  { value: "restricted", label: "Restricted", hint: "Optional, chosen by the employee." },
  { value: "company", label: "Company", hint: "Declared by the organisation." },
] as const;

export type HolidayKind = (typeof HOLIDAY_KINDS)[number]["value"];

export type Holiday = {
  id: number;
  name: string;
  holiday_date: string;
  kind: HolidayKind;
  is_paid: boolean;
  location: string | null;
  note: string | null;
  weekday: string;
  created_at: string;
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

export const listHolidays = (year: number) =>
  fetch(`${API_URL}/holidays?year=${year}`, { headers: authHeaders() }).then(
    handle<Holiday[]>,
  );

export const listHolidayYears = () =>
  fetch(`${API_URL}/holidays/years`, { headers: authHeaders() }).then(
    handle<number[]>,
  );

export const createHoliday = (body: Partial<Holiday>) =>
  fetch(`${API_URL}/holidays`, json("POST", body)).then(handle<Holiday>);

export const updateHoliday = (id: number, body: Partial<Holiday>) =>
  fetch(`${API_URL}/holidays/${id}`, json("PUT", body)).then(handle<Holiday>);

export const deleteHoliday = (id: number) =>
  fetch(`${API_URL}/holidays/${id}`, json("DELETE")).then(handle<void>);

export const bulkHolidays = (
  holidays: Partial<Holiday>[],
  replaceYear?: number,
) =>
  fetch(`${API_URL}/holidays/bulk`, json("POST", { holidays, replace_year: replaceYear })).then(
    handle<{ added: number; skipped: number; removed: number }>,
  );

const TONES: Record<string, string> = {
  public: "bg-primary/15 text-primary ring-primary/25",
  restricted: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  company: "bg-sky-500/15 text-sky-700 ring-sky-500/25",
};

export function holidayTone(kind: string) {
  return TONES[kind] ?? TONES.company;
}

export { ApiError };
