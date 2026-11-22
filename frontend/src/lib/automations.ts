import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type Cadence = "every_minutes" | "daily" | "monthly";

export type AutomationRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  message: string | null;
  triggered_by: string;
};

export type Automation = {
  id: number;
  key: string;
  name: string;
  description: string;
  is_enabled: boolean;
  cadence: Cadence;
  every_minutes: number;
  run_at: string;
  day_of_month: number;
  options: Record<string, unknown>;
  last_run_at: string | null;
  last_status: string | null;
  last_message: string | null;
  next_run_at: string | null;
  recent: AutomationRun[];
};

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  throw new ApiError(
    typeof data?.detail === "string" ? data.detail : "Something went wrong",
    res.status,
  );
}

export const listAutomations = () =>
  fetch(`${API_URL}/automations`, { headers: authHeaders() }).then(
    handle<Automation[]>,
  );

export const saveAutomation = (
  key: string,
  body: Partial<{
    is_enabled: boolean;
    cadence: Cadence;
    every_minutes: number;
    run_at: string;
    day_of_month: number;
    options: Record<string, unknown>;
  }>,
) =>
  fetch(`${API_URL}/automations/${key}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle<Automation>);

export const runAutomation = (key: string) =>
  fetch(`${API_URL}/automations/${key}/run`, {
    method: "POST",
    headers: authHeaders(),
  }).then(handle<Automation>);

/** "Every 15 minutes", "Daily at 02:00", "Monthly on the 1st at 03:00". */
export function describeSchedule(a: Automation) {
  const at = a.run_at.slice(0, 5);
  if (a.cadence === "every_minutes") {
    return a.every_minutes === 1
      ? "Every minute"
      : `Every ${a.every_minutes} minutes`;
  }
  if (a.cadence === "daily") return `Daily at ${at}`;

  const day = a.day_of_month;
  const suffix =
    day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th";
  return `Monthly on the ${day}${suffix} at ${at}`;
}

export { ApiError };
