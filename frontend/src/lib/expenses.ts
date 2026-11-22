import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type ExpenseCategory = {
  id: number;
  name: string;
  code: string;
  monthly_budget: string | null;
  note: string | null;
  is_active: boolean;
  sort_order: number;
  spent_this_month: string;
};

export type Expense = {
  id: number;
  reference: string;
  category_id: number;
  category_name: string | null;
  category_code: string | null;
  title: string;
  description: string | null;
  vendor: string | null;
  spent_on: string;
  amount: string;
  tax_amount: string;
  total_amount: string;
  payment_mode: string;
  payment_reference: string | null;
  invoice_number: string | null;
  gstin: string | null;
  status: string;
  paid_on: string | null;
  employee_id: number | null;
  employee_name: string | null;
  employee_code: string | null;
  receipt_path: string | null;
  recorded_by: string | null;
  created_at: string;
};

export type ExpensePage = {
  items: Expense[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  sum_amount: string;
};

export type CategorySpend = {
  category_id: number | null;
  name: string;
  code: string | null;
  spent: string;
  budget: string | null;
  share: number;
  over_budget: boolean;
  from_claims: boolean;
};

export type ExpenseSummary = {
  date_from: string;
  date_to: string;
  direct: string;
  claims: string;
  total: string;
  unpaid: string;
  budget: string;
  categories: CategorySpend[];
  months: { period: string; spent: string; claims: string }[];
};

export type ExpensePayload = {
  category_id: number;
  title: string;
  description?: string | null;
  vendor?: string | null;
  spent_on: string;
  amount: string;
  tax_amount: string;
  payment_mode: string;
  payment_reference?: string | null;
  invoice_number?: string | null;
  gstin?: string | null;
  status: string;
  paid_on?: string | null;
  employee_id?: number | null;
};

export const PAYMENT_MODES = ["bank", "cash", "card", "upi", "cheque", "other"];
export const EXPENSE_STATUSES = ["recorded", "approved", "paid"];

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
      ? String(detail[0]?.msg ?? "Invalid value").replace(/^Value error,\s*/, "")
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

function qs(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

export type ExpenseFilters = {
  date_from?: string;
  date_to?: string;
  category_id?: string;
  status?: string;
  q?: string;
  page?: number;
};

export const listExpenses = (f: ExpenseFilters = {}) =>
  fetch(`${API_URL}/expenses?${qs(f)}`, { headers: authHeaders() }).then(
    handle<ExpensePage>,
  );

export const expenseSummary = (f: { date_from?: string; date_to?: string }) =>
  fetch(`${API_URL}/expenses/summary?${qs(f)}`, { headers: authHeaders() }).then(
    handle<ExpenseSummary>,
  );

export const listExpenseCategories = () =>
  fetch(`${API_URL}/expenses/categories`, { headers: authHeaders() }).then(
    handle<ExpenseCategory[]>,
  );

export const saveExpenseCategory = (
  id: number | null,
  body: Partial<ExpenseCategory>,
) =>
  fetch(
    id ? `${API_URL}/expenses/categories/${id}` : `${API_URL}/expenses/categories`,
    json(id ? "PUT" : "POST", body),
  ).then(handle<ExpenseCategory>);

export const deleteExpenseCategory = (id: number) =>
  fetch(`${API_URL}/expenses/categories/${id}`, json("DELETE")).then(handle<void>);

export const createExpense = (body: ExpensePayload) =>
  fetch(`${API_URL}/expenses`, json("POST", body)).then(handle<Expense>);

export const updateExpense = (id: number, body: ExpensePayload) =>
  fetch(`${API_URL}/expenses/${id}`, json("PUT", body)).then(handle<Expense>);

export const deleteExpense = (id: number) =>
  fetch(`${API_URL}/expenses/${id}`, json("DELETE")).then(handle<void>);

export async function attachReceipt(id: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/expenses/${id}/receipt`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return handle<Expense>(res);
}

export async function exportExpenses(f: ExpenseFilters = {}) {
  const res = await fetch(`${API_URL}/expenses/export.csv?${qs(f)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new ApiError("Export failed", res.status);

  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = "expenses.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export { ApiError };
