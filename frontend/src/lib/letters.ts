import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";
import type { EmployeeDocument } from "./employees";

export type TemplateInput = {
  name: string;
  label: string;
  type: "text" | "textarea" | "date";
  required: boolean;
};

export type LetterTemplate = {
  id: number;
  key: string;
  name: string;
  category: string;
  subject: string;
  inputs: TemplateInput[];
  required_fields: string[];
  is_active: boolean;
  is_builtin: boolean;
};

export type LetterTemplateFull = LetterTemplate & {
  body: string;
  created_at: string;
  updated_at: string;
};

export type LetterPreview = {
  subject: string;
  html: string;
  missing_fields: string[];
  unknown_placeholders: string[];
};

export type MergeField = { name: string; label: string };

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

export async function listTemplates(
  includeInactive = false,
): Promise<LetterTemplate[]> {
  const qs = includeInactive ? "?include_inactive=true" : "";
  const res = await fetch(`${API_URL}/letter-templates${qs}`, {
    headers: authHeaders(),
  });
  return handle<LetterTemplate[]>(res);
}

export async function getTemplate(id: number): Promise<LetterTemplateFull> {
  const res = await fetch(`${API_URL}/letter-templates/${id}`, {
    headers: authHeaders(),
  });
  return handle<LetterTemplateFull>(res);
}

export async function listMergeFields(): Promise<MergeField[]> {
  const res = await fetch(`${API_URL}/letter-templates/merge-fields`, {
    headers: authHeaders(),
  });
  return handle<MergeField[]>(res);
}

export async function saveTemplate(
  id: number,
  payload: Partial<LetterTemplateFull>,
): Promise<LetterTemplateFull> {
  const res = await fetch(`${API_URL}/letter-templates/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<LetterTemplateFull>(res);
}

export async function previewLetter(
  employeeId: number,
  templateId: number,
  values: Record<string, string>,
): Promise<LetterPreview> {
  const res = await fetch(
    `${API_URL}/employees/${employeeId}/letters/${templateId}/preview`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  return handle<LetterPreview>(res);
}

export async function generateLetter(
  employeeId: number,
  templateId: number,
  values: Record<string, string>,
): Promise<EmployeeDocument> {
  const res = await fetch(
    `${API_URL}/employees/${employeeId}/letters/${templateId}/generate`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  return handle<EmployeeDocument>(res);
}

export { ApiError };
