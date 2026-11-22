// Every call appends a path beginning with "/", so a trailing slash here
// produces "//auth/login" — which the API answers with a 404 that looks
// like a missing route rather than a mistyped variable.
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:9300"
).replace(/\/+$/, "");

const TOKEN_KEY = "hrms_admin_token";

export type LoginResponse = {
  /** Absent when a second step is still owed. */
  access_token: string | null;
  token_type: string;
  expires_at: string | null;
  mfa_required: boolean;
  challenge_token: string | null;
};

/** Throws an Error carrying the API's message on non-2xx. */
export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data?.detail;
    // FastAPI validation errors arrive as an array of issue objects.
    const message = Array.isArray(detail)
      ? (detail[0]?.msg ?? "Invalid details")
      : typeof detail === "string"
        ? detail
        : "Unable to sign in. Please try again.";
    throw new Error(message);
  }

  return data as LoginResponse;
}

/** Second step: a code from the authenticator app, or a backup code. */
export async function loginMfa(
  challengeToken: string,
  code: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/auth/login/mfa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(
      Array.isArray(detail)
        ? (detail[0]?.msg ?? "That code is not right")
        : typeof detail === "string"
          ? detail
          : "That code is not right",
    );
  }

  return data as LoginResponse;
}

export type Admin = {
  id: number;
  email: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
  role: string;
  permissions: Record<string, string>;
};

/** Does this admin have at least `needed` access to a module? */
export function can(
  admin: Admin | null,
  module: string,
  needed: "read" | "write" = "read",
) {
  if (!admin) return false;
  if (admin.role === "owner") return true;
  const have = admin.permissions?.[module] ?? "none";
  return needed === "read" ? have === "read" || have === "write" : have === "write";
}

/** Returns null when the token is missing, expired or rejected. */
export async function fetchMe(): Promise<Admin | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as Admin;
  } catch {
    return null;
  }
}

export function storeToken(token: string, remember: boolean) {
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? null
  );
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}
