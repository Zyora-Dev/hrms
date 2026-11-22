import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type EmployeeSettings = {
  id: number;
  code_pattern: string;
  code_padding: number;
  code_next_number: number;
  code_reset: "never" | "yearly";
  code_reset_year: number | null;
  allow_manual_code: boolean;
  default_probation_days: number;
  updated_at: string;
  preview: string[];
};

export type EmployeeSettingsPayload = Omit<
  EmployeeSettings,
  "id" | "updated_at" | "preview" | "code_reset_year"
>;

export type CodeToken = { token: string; description: string };

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

export const getEmployeeSettings = () =>
  fetch(`${API_URL}/settings/employee`, { headers: authHeaders() }).then(
    handle<EmployeeSettings>,
  );

export const saveEmployeeSettings = (p: EmployeeSettingsPayload) =>
  fetch(`${API_URL}/settings/employee`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(p),
  }).then(handle<EmployeeSettings>);

export const listCodeTokens = () =>
  fetch(`${API_URL}/settings/employee/code-tokens`, {
    headers: authHeaders(),
  }).then(handle<CodeToken[]>);

export const previewCode = (p: {
  code_pattern: string;
  code_padding: number;
  code_next_number: number;
}) =>
  fetch(`${API_URL}/settings/employee/code-preview`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(p),
  }).then(handle<string[]>);

export { ApiError };
