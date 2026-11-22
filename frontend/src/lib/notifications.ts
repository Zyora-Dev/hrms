import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  entity: string | null;
  entity_id: number | null;
  actor: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationSummary = {
  unread: number;
  pending: { leave: number; claims: number };
};

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  throw new ApiError(
    typeof data?.detail === "string" ? data.detail : "Could not load",
    res.status,
  );
}

export const listNotifications = (limit = 20) =>
  fetch(`${API_URL}/notifications?limit=${limit}`, {
    headers: authHeaders(),
  }).then(handle<Notification[]>);

export const notificationSummary = () =>
  fetch(`${API_URL}/notifications/summary`, { headers: authHeaders() }).then(
    handle<NotificationSummary>,
  );

export const markRead = (id: number) =>
  fetch(`${API_URL}/notifications/${id}/read`, {
    method: "POST",
    headers: authHeaders(),
  }).then(handle<Notification>);

export const markAllRead = () =>
  fetch(`${API_URL}/notifications/read-all`, {
    method: "POST",
    headers: authHeaders(),
  }).then(handle<NotificationSummary>);

/** "3 min ago" from a timestamp, given a clock read outside render. */
export function ago(iso: string, now: number) {
  const diff = Math.max(now - new Date(iso).getTime(), 0);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export { ApiError };
