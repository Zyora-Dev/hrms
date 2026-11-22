import { API_URL, getToken } from "./auth";

export const COMPANY_TYPES = [
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership_llp", label: "Partnership / LLP" },
  { value: "private_limited", label: "Private Limited" },
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number]["value"];

export function companyTypeLabel(value: string) {
  return COMPANY_TYPES.find((t) => t.value === value)?.label ?? value;
}

export type Company = {
  id: number;
  company_uid: string;
  name: string;
  slug: string;
  company_type: CompanyType;
  logo_path: string | null;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  tan: string | null;
  pf_code: string | null;
  esic_code: string | null;
  pt_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyPayload = {
  name: string;
  slug: string;
  company_type: CompanyType;
  email: string;
  phone: string;
  address: string;
  gstin: string;
  pan: string;
  cin: string;
  tan: string;
  pf_code: string;
  esic_code: string;
  pt_number: string;
};

/** Field-level messages pulled out of a FastAPI 422 response. */
export class ApiError extends Error {
  fields: Record<string, string>;
  status: number;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const detail = data?.detail;

  if (Array.isArray(detail)) {
    const fields: Record<string, string> = {};
    for (const issue of detail) {
      const key = issue?.loc?.[issue.loc.length - 1];
      if (typeof key === "string") {
        fields[key] = String(issue.msg ?? "").replace(/^Value error,\s*/, "");
      }
    }
    const first = Object.values(fields)[0] ?? "Please check the highlighted fields";
    throw new ApiError(first, res.status, fields);
  }

  throw new ApiError(
    typeof detail === "string" ? detail : "Something went wrong",
    res.status,
  );
}

/** Returns null when no company profile has been created yet. */
export async function getCompany(): Promise<Company | null> {
  const res = await fetch(`${API_URL}/company`, { headers: authHeaders() });
  if (res.status === 404) return null;
  return handle<Company>(res);
}

export async function createCompany(payload: CompanyPayload): Promise<Company> {
  const res = await fetch(`${API_URL}/company`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<Company>(res);
}

export async function updateCompany(payload: CompanyPayload): Promise<Company> {
  const res = await fetch(`${API_URL}/company`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<Company>(res);
}

export async function uploadLogo(file: File): Promise<Company> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_URL}/company/logo`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return handle<Company>(res);
}

export async function deleteLogo(): Promise<Company> {
  const res = await fetch(`${API_URL}/company/logo`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<Company>(res);
}
