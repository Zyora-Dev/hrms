import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type LibraryFolder = {
  employee_id: number;
  employee_code: string;
  employee_name: string | null;
  department: string | null;
  designation: string | null;
  photo_path: string | null;
  documents: number;
  kinds: string[];
  latest_at: string | null;
};

export type LibraryDocument = {
  id: number;
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  department?: string | null;
  doc_type: string;
  title: string | null;
  original_name: string | null;
  file_path: string;
  file_url: string | null;
  uploaded_at: string;
};

export type Library = {
  folders: LibraryFolder[];
  total_documents: number;
  total_employees: number;
  missing: string[];
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

export const loadLibrary = (params: {
  q?: string;
  department_id?: string;
  doc_type?: string;
  only_missing?: boolean;
}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.department_id && params.department_id !== "all") {
    qs.set("department_id", params.department_id);
  }
  if (params.doc_type && params.doc_type !== "all") {
    qs.set("doc_type", params.doc_type);
  }
  if (params.only_missing) qs.set("only_missing", "true");

  return fetch(`${API_URL}/documents?${qs}`, { headers: authHeaders() }).then(
    handle<Library>,
  );
};

export const recentDocuments = () =>
  fetch(`${API_URL}/documents/recent`, { headers: authHeaders() }).then(
    handle<LibraryDocument[]>,
  );

export const employeeDocuments = (employeeId: number) =>
  fetch(`${API_URL}/documents/employee/${employeeId}`, {
    headers: authHeaders(),
  }).then(handle<LibraryDocument[]>);

export function kindLabel(kind: string) {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export { ApiError };
