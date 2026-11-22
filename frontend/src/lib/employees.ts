import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
] as const;

export const MARITAL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
] as const;

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "consultant", label: "Consultant" },
] as const;

export const EMPLOYEE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
  { value: "notice_period", label: "Notice period" },
  { value: "on_leave", label: "On leave" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
] as const;

export const DOC_TYPES = [
  { value: "id_proof", label: "ID proof" },
  { value: "address_proof", label: "Address proof" },
  { value: "degree_certificate", label: "Degree certificate" },
  { value: "experience_letter", label: "Experience letter" },
  { value: "offer_letter", label: "Offer letter" },
  { value: "payslip", label: "Payslip" },
  { value: "letter", label: "Generated letter" },
  { value: "other", label: "Other" },
] as const;

export type Gender = (typeof GENDERS)[number]["value"];
export type MaritalStatus = (typeof MARITAL_STATUSES)[number]["value"];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["value"];
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]["value"];
export type DocType = (typeof DOC_TYPES)[number]["value"];

export function labelOf(
  options: readonly { value: string; label: string }[],
  value: string | null,
) {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}

export type EmployeeDocument = {
  id: number;
  doc_type: DocType;
  title: string | null;
  file_path: string;
  file_url: string | null;
  original_name: string | null;
  uploaded_at: string;
};

export type EmployeeFields = {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: Gender | null;
  date_of_birth: string | null;
  blood_group: string | null;
  marital_status: MaritalStatus | null;

  work_email: string;
  personal_email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  current_address: string | null;
  permanent_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;

  designation_id: number | null;
  department_id: number | null;
  employment_type: EmploymentType;
  work_location: string | null;
  date_of_joining: string;
  probation_end_date: string | null;
  date_of_exit: string | null;
  status: EmployeeStatus;
  reporting_manager_id: number | null;

  ctc_annual: string | null;
  pan: string | null;
  aadhaar: string | null;
  /** What the API returns: the number itself never comes back. */
  aadhaar_masked?: string | null;
  uan: string | null;
  pf_number: string | null;
  esic_number: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
};

export type Employee = EmployeeFields & {
  id: number;
  employee_code: string;
  full_name: string;
  /** Resolved names, read-only (the form submits ids). */
  designation: string | null;
  department: string | null;
  photo_path: string | null;
  photo_url: string | null;
  reporting_manager_name: string | null;
  documents: EmployeeDocument[];
  created_at: string;
  updated_at: string;
};

export type EmployeeListItem = {
  id: number;
  employee_code: string;
  full_name: string;
  work_email: string;
  designation: string | null;
  department: string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  date_of_joining: string;
  photo_url: string | null;
};

export type EmployeePage = {
  items: EmployeeListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
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
    const fields: Record<string, string> = {};
    for (const issue of detail) {
      const key = issue?.loc?.[issue.loc.length - 1];
      if (typeof key === "string") {
        fields[key] = String(issue.msg ?? "").replace(/^Value error,\s*/, "");
      }
    }
    const first =
      Object.values(fields)[0] ?? "Please check the highlighted fields";
    throw new ApiError(first, res.status, fields);
  }

  throw new ApiError(
    typeof detail === "string" ? detail : "Something went wrong",
    res.status,
  );
}

export type ListParams = {
  q?: string;
  department_id?: number;
  status?: string;
  employment_type?: string;
  page?: number;
  page_size?: number;
};

export async function listEmployees(params: ListParams = {}): Promise<EmployeePage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== "all") {
      search.set(key, String(value));
    }
  }
  const res = await fetch(`${API_URL}/employees?${search}`, {
    headers: authHeaders(),
  });
  return handle<EmployeePage>(res);
}

export async function getEmployee(id: number): Promise<Employee> {
  const res = await fetch(`${API_URL}/employees/${id}`, { headers: authHeaders() });
  return handle<Employee>(res);
}

export async function createEmployee(payload: EmployeeFields): Promise<Employee> {
  const res = await fetch(`${API_URL}/employees`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<Employee>(res);
}

export async function updateEmployee(
  id: number,
  payload: EmployeeFields,
): Promise<Employee> {
  const res = await fetch(`${API_URL}/employees/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<Employee>(res);
}

export async function deleteEmployee(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/employees/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<void>(res);
}

export async function uploadPhoto(id: number, file: File): Promise<Employee> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_URL}/employees/${id}/photo`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return handle<Employee>(res);
}

export async function deletePhoto(id: number): Promise<Employee> {
  const res = await fetch(`${API_URL}/employees/${id}/photo`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<Employee>(res);
}

export async function uploadDocument(
  id: number,
  docType: DocType,
  file: File,
  title?: string,
): Promise<EmployeeDocument> {
  const body = new FormData();
  body.append("doc_type", docType);
  body.append("file", file);
  if (title) body.append("title", title);

  const res = await fetch(`${API_URL}/employees/${id}/documents`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return handle<EmployeeDocument>(res);
}

export async function deleteDocument(
  employeeId: number,
  documentId: number,
): Promise<void> {
  const res = await fetch(
    `${API_URL}/employees/${employeeId}/documents/${documentId}`,
    { method: "DELETE", headers: authHeaders() },
  );
  return handle<void>(res);
}

/** Blank form values for a new employee. */
export function emptyEmployee(): EmployeeFields {
  return {
    first_name: "",
    middle_name: "",
    last_name: "",
    gender: null,
    date_of_birth: "",
    blood_group: "",
    marital_status: null,
    work_email: "",
    personal_email: "",
    phone: "",
    alternate_phone: "",
    current_address: "",
    permanent_address: "",
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emergency_contact_phone: "",
    designation_id: null,
    department_id: null,
    employment_type: "full_time",
    work_location: "",
    date_of_joining: "",
    probation_end_date: "",
    date_of_exit: "",
    status: "active",
    reporting_manager_id: null,
    ctc_annual: "",
    pan: "",
    aadhaar: "",
    uan: "",
    pf_number: "",
    esic_number: "",
    bank_account_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_name: "",
  };
}

/** Strip empty strings so the API receives nulls rather than "". */
export function toPayload(form: EmployeeFields): EmployeeFields {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    clean[key] = value === "" ? null : value;
  }
  // These are required by the API and must stay strings.
  clean.first_name = form.first_name.trim();
  clean.last_name = form.last_name.trim();
  clean.work_email = form.work_email.trim();
  clean.date_of_joining = form.date_of_joining;
  return clean as EmployeeFields;
}

/** Reveal the full number. The server records who asked. */
export async function revealAadhaar(employeeId: number): Promise<string> {
  const res = await fetch(`${API_URL}/employees/${employeeId}/aadhaar`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      typeof data?.detail === "string" ? data.detail : "Not available",
      res.status,
    );
  }
  return (data as { aadhaar: string }).aadhaar;
}

export { ApiError };
