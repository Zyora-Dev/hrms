import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type AuditChange = { from: unknown; to: unknown };

export type AuditEntry = {
  id: number;
  at: string;
  admin_id: number | null;
  admin_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  label: string | null;
  summary: string | null;
  changes: Record<string, AuditChange>;
  method: string | null;
  path: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

export type AuditPage = {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type AuditFacets = {
  actions: string[];
  entities: string[];
  admins: string[];
};

export type AuditQuery = {
  date_from?: string;
  date_to?: string;
  action?: string;
  entity?: string;
  admin_email?: string;
  entity_id?: string;
  q?: string;
  page?: number;
  page_size?: number;
};

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  throw new ApiError(
    typeof data?.detail === "string" ? data.detail : "Could not load the trail",
    res.status,
  );
}

function toSearch(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === "all") continue;
    search.set(key, String(value));
  }
  return search;
}

export const listAudit = (params: AuditQuery = {}) =>
  fetch(`${API_URL}/audit?${toSearch(params)}`, { headers: authHeaders() }).then(
    handle<AuditPage>,
  );

export const auditFacets = () =>
  fetch(`${API_URL}/audit/facets`, { headers: authHeaders() }).then(
    handle<AuditFacets>,
  );

export async function exportAudit(params: AuditQuery = {}) {
  const res = await fetch(`${API_URL}/audit/export.csv?${toSearch(params)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new ApiError("Export failed", res.status);

  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = "audit-trail.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

/** "attendance_day" → "Attendance day" */
export function prettyEntity(entity: string) {
  const text = entity.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function prettyField(field: string) {
  return field.replace(/_/g, " ");
}

export function prettyValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const ACTION_TONES: Record<string, string> = {
  create: "bg-primary/15 text-primary ring-primary/25",
  update: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
  delete: "bg-destructive/15 text-destructive ring-destructive/25",
  login: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25",
  login_failed: "bg-destructive/15 text-destructive ring-destructive/25",
  action: "bg-muted text-muted-foreground ring-border",
};

export { ApiError };
