import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type PermissionLevel = "none" | "read" | "write";

export type TeamMember = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  permissions: Record<string, string>;
  is_active: boolean;
  invited_by: string | null;
  created_at: string;
  password_changed_at: string | null;
  totp_enabled: boolean;
  last_seen_at: string | null;
  temporary_password: string | null;
};

export type PermissionModule = { key: string; label: string };

export type Backup = {
  name: string;
  size_bytes: number;
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
  throw new ApiError(
    Array.isArray(detail)
      ? String(detail[0]?.msg ?? "Invalid value")
      : typeof detail === "string"
        ? detail
        : "Something went wrong",
    res.status,
  );
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { ...authHeaders(), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const listModules = () =>
  fetch(`${API_URL}/team/modules`, { headers: authHeaders() }).then(
    handle<PermissionModule[]>,
  );

export const listTeam = () =>
  fetch(`${API_URL}/team`, { headers: authHeaders() }).then(
    handle<TeamMember[]>,
  );

export const inviteMember = (body: {
  email: string;
  name?: string | null;
  password?: string | null;
  permissions: Record<string, PermissionLevel>;
}) => fetch(`${API_URL}/team`, json("POST", body)).then(handle<TeamMember>);

export const updateMember = (
  id: number,
  body: {
    name?: string | null;
    permissions?: Record<string, PermissionLevel>;
    is_active?: boolean;
    password?: string | null;
  },
) => fetch(`${API_URL}/team/${id}`, json("PUT", body)).then(handle<TeamMember>);

export const removeMember = (id: number) =>
  fetch(`${API_URL}/team/${id}`, json("DELETE")).then(handle<void>);

/* ------------------------------------------------------------------ */

export const listBackups = () =>
  fetch(`${API_URL}/backups`, { headers: authHeaders() }).then(
    handle<Backup[]>,
  );

export const takeBackup = () =>
  fetch(`${API_URL}/backups`, json("POST")).then(handle<Backup>);

export const deleteBackup = (name: string) =>
  fetch(`${API_URL}/backups/${name}`, json("DELETE")).then(handle<void>);

/** Fetches with auth, then hands the browser a blob to save. */
export async function downloadBackup(name: string) {
  const res = await fetch(`${API_URL}/backups/${name}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new ApiError("Could not download the backup", res.status);

  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { ApiError };
