import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type LookupKind = "departments" | "designations";

export type Lookup = {
  id: number;
  name: string;
  is_active: boolean;
  /** How many employees reference it — drives the delete guard. */
  in_use: number;
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

export async function listLookups(
  kind: LookupKind,
  includeInactive = false,
): Promise<Lookup[]> {
  const qs = includeInactive ? "?include_inactive=true" : "";
  const res = await fetch(`${API_URL}/lookups/${kind}${qs}`, { headers: authHeaders() });
  return handle<Lookup[]>(res);
}

export async function createLookup(
  kind: LookupKind,
  name: string,
): Promise<Lookup> {
  const res = await fetch(`${API_URL}/lookups/${kind}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handle<Lookup>(res);
}

export async function updateLookup(
  kind: LookupKind,
  id: number,
  name: string,
  isActive: boolean,
): Promise<Lookup> {
  const res = await fetch(`${API_URL}/lookups/${kind}/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, is_active: isActive }),
  });
  return handle<Lookup>(res);
}

export async function deleteLookup(
  kind: LookupKind,
  id: number,
): Promise<void> {
  const res = await fetch(`${API_URL}/lookups/${kind}/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<void>(res);
}

export { ApiError };
