import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type Account = {
  id: number;
  email: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
  password_changed_at: string | null;
  totp_enabled: boolean;
  totp_enabled_at: string | null;
  backup_codes_left: number;
  active_sessions: number;
};

export type AdminSession = {
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

export type MfaSetup = {
  secret: string;
  otpauth_uri: string;
  qr_png: string;
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
    throw new ApiError(
      String(detail[0]?.msg ?? "Invalid value").replace(/^Value error,\s*/, ""),
      res.status,
      {},
    );
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

export const getAccount = () =>
  fetch(`${API_URL}/account`, { headers: authHeaders() }).then(handle<Account>);

export const saveProfile = (name: string | null) =>
  fetch(`${API_URL}/account/profile`, json("PUT", { name })).then(
    handle<Account>,
  );

export const changePassword = (
  current_password: string,
  new_password: string,
) =>
  fetch(
    `${API_URL}/account/password`,
    json("PUT", { current_password, new_password }),
  ).then(handle<void>);

export const startMfa = () =>
  fetch(`${API_URL}/account/2fa/setup`, json("POST")).then(handle<MfaSetup>);

export const enableMfa = (code: string) =>
  fetch(`${API_URL}/account/2fa/enable`, json("POST", { code })).then(
    handle<{ codes: string[] }>,
  );

export const disableMfa = (password: string) =>
  fetch(`${API_URL}/account/2fa/disable`, json("POST", { password })).then(
    handle<Account>,
  );

export const newBackupCodes = (password: string) =>
  fetch(`${API_URL}/account/2fa/backup-codes`, json("POST", { password })).then(
    handle<{ codes: string[] }>,
  );

export const listSessions = () =>
  fetch(`${API_URL}/account/sessions`, { headers: authHeaders() }).then(
    handle<AdminSession[]>,
  );

export const revokeSession = (id: number) =>
  fetch(`${API_URL}/account/sessions/${id}`, json("DELETE")).then(handle<void>);

export const revokeOtherSessions = () =>
  fetch(`${API_URL}/account/sessions/revoke-others`, json("POST")).then(
    handle<AdminSession[]>,
  );

/** "2 hours ago", "3 days ago" — read off a timestamp without a clock call. */
export function since(iso: string, now: number) {
  const diff = Math.max(now - new Date(iso).getTime(), 0);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export { ApiError };
