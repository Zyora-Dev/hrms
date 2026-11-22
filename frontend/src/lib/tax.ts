import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type TaxBand = {
  id?: number;
  seq?: number;
  upto: string | null;
  rate_percent: string;
};

export type TaxRegime = {
  id: number;
  financial_year: number;
  code: "new" | "old";
  name: string;
  standard_deduction: string;
  rebate_income_limit: string;
  rebate_max_amount: string;
  marginal_relief: boolean;
  cess_percent: string;
  surcharge_cap_percent: string;
  allow_chapter_vi: boolean;
  is_default: boolean;
  is_active: boolean;
  slabs: TaxBand[];
  surcharges: TaxBand[];
};

export type DeductionSection = {
  id: number;
  code: string;
  name: string;
  max_amount: string | null;
  allowed_in_old: boolean;
  allowed_in_new: boolean;
  sort_order: number;
  is_active: boolean;
  note: string | null;
};

export type TaxLine = { label: string; amount: string; note: string | null };

export type TaxComputation = {
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  financial_year: number;
  regime_code: "new" | "old";
  regime_name: string;
  gross_salary: string;
  other_income: string;
  exemptions: TaxLine[];
  deductions: TaxLine[];
  total_exemptions: string;
  total_deductions: string;
  taxable_income: string;
  slab_tax: string;
  rebate: string;
  tax_after_rebate: string;
  surcharge: string;
  cess: string;
  annual_tax: string;
  already_deducted: string;
  remaining_months: number;
  monthly_tds: string;
  months_elapsed: number;
  earned_so_far: string;
  projected_remaining: string;
};

export type RegimeComparison = {
  employee_id: number;
  financial_year: number;
  new_regime: TaxComputation;
  old_regime: TaxComputation;
  better: "new" | "old";
  saving: string;
};

export type DeclarationItem = { code: string; amount: string };

export type TaxDeclaration = {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_code: string | null;
  financial_year: number;
  regime_code: "new" | "old";
  items: DeclarationItem[];
  hra_rent_paid: string;
  hra_metro: boolean;
  other_income: string;
  verified: boolean;
  note: string | null;
  updated_at: string;
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

const json = (method: string, body?: unknown) => ({
  method,
  headers: { ...authHeaders(), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const listRegimes = (year: number) =>
  fetch(`${API_URL}/tax/regimes?financial_year=${year}`, {
    headers: authHeaders(),
  }).then(handle<TaxRegime[]>);

export const saveRegime = (id: number, body: Partial<TaxRegime>) =>
  fetch(`${API_URL}/tax/regimes/${id}`, json("PUT", body)).then(
    handle<TaxRegime>,
  );

export const listSections = () =>
  fetch(`${API_URL}/tax/sections`, { headers: authHeaders() }).then(
    handle<DeductionSection[]>,
  );

export const saveSection = (id: number, body: Partial<DeductionSection>) =>
  fetch(`${API_URL}/tax/sections/${id}`, json("PUT", body)).then(
    handle<DeductionSection>,
  );

export const createSection = (body: Partial<DeductionSection>) =>
  fetch(`${API_URL}/tax/sections`, json("POST", body)).then(
    handle<DeductionSection>,
  );

export const deleteSection = (id: number) =>
  fetch(`${API_URL}/tax/sections/${id}`, json("DELETE")).then(handle<void>);

export const computeTax = (employeeId: number, year: number, regime?: string) => {
  const qs = new URLSearchParams({ financial_year: String(year) });
  if (regime) qs.set("regime", regime);
  return fetch(`${API_URL}/tax/compute/${employeeId}?${qs}`, {
    headers: authHeaders(),
  }).then(handle<TaxComputation>);
};

export const computeAll = (year: number) =>
  fetch(`${API_URL}/tax/compute?financial_year=${year}`, {
    headers: authHeaders(),
  }).then(handle<TaxComputation[]>);

export const compareRegimes = (employeeId: number, year: number) =>
  fetch(`${API_URL}/tax/compare/${employeeId}?financial_year=${year}`, {
    headers: authHeaders(),
  }).then(handle<RegimeComparison>);

export const listDeclarations = (year: number) =>
  fetch(`${API_URL}/tax/declarations?financial_year=${year}`, {
    headers: authHeaders(),
  }).then(handle<TaxDeclaration[]>);

export const saveDeclaration = (
  employeeId: number,
  body: Partial<TaxDeclaration>,
) =>
  fetch(`${API_URL}/tax/declarations/${employeeId}`, json("PUT", body)).then(
    handle<TaxDeclaration>,
  );

export { ApiError };
