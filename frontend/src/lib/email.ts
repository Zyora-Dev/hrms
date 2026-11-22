import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type EmailSettings = {
  id: number;
  is_enabled: boolean;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  redirect_to: string | null;
  send_payslips: boolean;
  send_leave_decisions: boolean;
  send_claim_decisions: boolean;
  send_portal_invites: boolean;
  send_admin_alerts: boolean;
  provider_ready: boolean;
  provider_url: string | null;
  env_from_address: string | null;
  queued: number;
  failed: number;
  sent_today: number;
};

export type EmailMessage = {
  id: number;
  kind: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type EmailSettingsPayload = Omit<
  EmailSettings,
  "id" | "provider_ready" | "provider_url" | "env_from_address" | "queued" | "failed" | "sent_today"
>;

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
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

export const getEmailSettings = () =>
  fetch(`${API_URL}/email/settings`, { headers: authHeaders() }).then(
    handle<EmailSettings>,
  );

export const saveEmailSettings = (body: EmailSettingsPayload) =>
  fetch(`${API_URL}/email/settings`, json("PUT", body)).then(
    handle<EmailSettings>,
  );

export const sendTestEmail = (to_email: string) =>
  fetch(`${API_URL}/email/test`, json("POST", { to_email })).then(
    handle<{ message: string }>,
  );

export const listOutbox = (status?: string) =>
  fetch(
    `${API_URL}/email/outbox${status && status !== "all" ? `?status=${status}` : ""}`,
    { headers: authHeaders() },
  ).then(handle<EmailMessage[]>);

export const flushOutbox = () =>
  fetch(`${API_URL}/email/outbox/flush`, json("POST")).then(
    handle<{ sent: number; failed: number }>,
  );

export const retryEmail = (id: number) =>
  fetch(`${API_URL}/email/outbox/${id}/retry`, json("POST")).then(
    handle<EmailMessage>,
  );

export { ApiError };
