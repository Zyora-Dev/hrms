"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Download,
  Loader2,
  Paperclip,
  Plus,
  Receipt,
  Save,
  Search,
  Settings2,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { API_URL } from "@/lib/auth";
import {
  ApiError,
  EXPENSE_STATUSES,
  PAYMENT_MODES,
  attachReceipt,
  createExpense,
  deleteExpense,
  deleteExpenseCategory,
  expenseSummary,
  exportExpenses,
  listExpenseCategories,
  listExpenses,
  saveExpenseCategory,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseSummary,
} from "@/lib/expenses";
import { rupees } from "@/lib/payroll";
import { cn } from "@/lib/utils";

const TH = "px-2 py-2 text-xs font-bold";
const TD = "px-2 py-2 text-xs";

const TONES: Record<string, string> = {
  recorded: "bg-muted text-foreground/75",
  approved: "bg-amber-500/20 text-amber-800",
  paid: "bg-emerald-500/15 text-emerald-800",
};

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [year, index] = month.split("-").map(Number);
  const last = new Date(year, index, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function ExpensesView() {
  // The current month comes from the browser's clock, so the server cannot
  // know it. `useSyncExternalStore` hydrates with the server's answer and
  // then swaps in the real one, which is what keeps the two renders in
  // agreement; reading the clock in the initial state does not.
  const thisMonth = useSyncExternalStore(
    () => () => {},
    () => monthKey(),
    () => "",
  );
  const [override, setOverride] = useState<{ from: string; to: string } | null>(
    null,
  );
  // Memoised deliberately: a fresh object here would change `load` on every
  // render, which re-runs the effect, which re-renders — the table flickering
  // between its skeleton and its empty state was this loop.
  const range = useMemo(
    () => override ?? (thisMonth ? monthRange(thisMonth) : null),
    [override, thisMonth],
  );
  const setRange = setOverride;
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [page, setPage] = useState<Awaited<ReturnType<typeof listExpenses>> | null>(
    null,
  );
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    if (!range) return;
    listExpenseCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
    listExpenses({
      date_from: range.from,
      date_to: range.to,
      category_id: category,
      status,
      q: search || undefined,
    })
      .then(setPage)
      .catch(() => setPage(null));
    expenseSummary({ date_from: range.from, date_to: range.to })
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [range, category, status, search]);

  useEffect(load, [load, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  if (!range) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const exportNow = () =>
    exportExpenses({
      date_from: range.from,
      date_to: range.to,
      category_id: category,
      status,
      q: search || undefined,
    }).catch(() => toast.error("Export failed"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-foreground/80">
            What the company spent, filed by category and checked against a
            monthly budget. Staff reimbursements are counted in the totals but
            stay under Payroll, where they are approved.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" className="h-9" onClick={exportNow}>
            <Download className="size-4" />
            Export
          </Button>
          <Button className="h-9" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            New expense
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Spent in range" value={rupees(summary?.total ?? 0, 0)} />
        <Tile label="Company spend" value={rupees(summary?.direct ?? 0, 0)} />
        <Tile
          label="Staff reimbursements"
          value={rupees(summary?.claims ?? 0, 0)}
        />
        <Tile
          label="Still unpaid"
          value={rupees(summary?.unpaid ?? 0, 0)}
          tone={Number(summary?.unpaid ?? 0) > 0 ? "warn" : undefined}
        />
      </div>

      {/* Filters on the left, actions on the right, one row each on a phone.
          Grouping the dates in their own bordered shell stops "to" drifting
          away from the fields it belongs to when the row wraps. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-2.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-1.5 py-1">
          <Input
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
            className="h-7 w-[132px] border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
          />
          <span className="text-[11px] font-semibold text-foreground/70">to</span>
          <Input
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
            className="h-7 w-[132px] border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {EXPENSE_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[170px] flex-1 sm:max-w-[230px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground/60" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, vendor, invoice"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Button
          size="sm"
          variant={showCategories ? "default" : "outline"}
          className="ml-auto h-8 text-xs"
          onClick={() => setShowCategories((v) => !v)}
        >
          <Settings2 className="size-3.5" />
          Categories
        </Button>
      </div>

      {showCategories && (
        <CategoryManager categories={categories} onChanged={reload} />
      )}

      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border/60">
                <tr>
                  <th className={`${TH} pl-4 text-left`}>Expense</th>
                  <th className={`${TH} text-left`}>Category</th>
                  <th className={`${TH} text-left`}>Date</th>
                  <th className={`${TH} text-right`}>Amount</th>
                  <th className={`${TH} text-left`}>Status</th>
                  <th className={`${TH} w-20 pr-4`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {!page &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-4 py-2">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))}

                {page?.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-14">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground/60">
                          <Wallet className="size-4" />
                        </span>
                        <p className="text-sm font-semibold">Nothing recorded</p>
                        <p className="text-xs text-foreground/75">
                          Record what the company spent in this period.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {page?.items.map((row) => (
                  <tr key={row.id}>
                    <td className={`${TD} pl-4`}>
                      <span className="flex items-center gap-1.5 font-semibold">
                        {row.title}
                        {row.receipt_path && (
                          <a
                            href={`${API_URL}${row.receipt_path}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Receipt"
                            className="text-foreground/60 hover:text-foreground"
                          >
                            <Paperclip className="size-3" />
                          </a>
                        )}
                      </span>
                      <span className="block text-[10px] text-foreground/70">
                        {row.reference}
                        {row.vendor ? ` · ${row.vendor}` : ""}
                        {row.invoice_number ? ` · ${row.invoice_number}` : ""}
                      </span>
                    </td>
                    <td className={TD}>{row.category_name}</td>
                    <td className={TD}>{row.spent_on}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      <span className="font-semibold">
                        {rupees(row.total_amount, 0)}
                      </span>
                      {Number(row.tax_amount) > 0 && (
                        <span className="block text-[10px] text-foreground/70">
                          incl. {rupees(row.tax_amount, 0)} tax
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                          TONES[row.status],
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className={`${TD} pr-4 text-right`}>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px]"
                          onClick={() => setEditing(row)}
                        >
                          Edit
                        </Button>
                        <IconButton
                          label="Delete"
                          icon={Trash2}
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            if (!window.confirm(`Delete ${row.reference}?`)) return;
                            await deleteExpense(row.id).catch(() =>
                              toast.error("Could not delete it"),
                            );
                            reload();
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {page && page.total > 0 && (
            <p className="border-t border-border/60 px-4 py-2.5 text-[11px] font-medium text-foreground/75">
              {page.total} expense{page.total === 1 ? "" : "s"} ·{" "}
              {rupees(page.sum_amount, 0)} in this range
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-card p-4">
          <h2 className="text-sm font-bold">Where it went</h2>
          <p className="mt-0.5 text-[11px] text-foreground/70">
            Reimbursements are counted here but managed under Payroll.
          </p>

          <ul className="mt-4 space-y-3">
            {(summary?.categories ?? [])
              .filter((c) => Number(c.spent) > 0)
              .map((c) => (
                <li key={c.name}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">
                      {c.name}
                      {c.from_claims && (
                        <span className="ml-1.5 text-[10px] text-foreground/60">
                          via claims
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {rupees(c.spent, 0)}
                      <span className="ml-1.5 text-[10px] font-normal text-foreground/70">
                        {c.share}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      style={{ width: `${Math.min(c.share, 100)}%` }}
                      className={cn(
                        "h-full rounded-full",
                        c.over_budget ? "bg-destructive" : "bg-chart-1",
                      )}
                    />
                  </div>
                  {c.budget && (
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        c.over_budget
                          ? "font-semibold text-destructive"
                          : "text-foreground/70",
                      )}
                    >
                      {c.over_budget ? "Over" : "Within"} the{" "}
                      {rupees(c.budget, 0)} budget
                    </p>
                  )}
                </li>
              ))}

            {(summary?.categories ?? []).every((c) => Number(c.spent) === 0) && (
              <li className="text-xs text-foreground/75">
                Nothing spent in this range.
              </li>
            )}
          </ul>
        </section>
      </div>

      {editing && (
        <ExpenseDialog
          expense={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3",
        tone === "warn" ? "border-amber-500/40" : "border-border/60",
      )}
    >
      <p className="text-[11px] font-semibold text-foreground/70">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-bold tracking-tight",
          tone === "warn" && "text-amber-700",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ExpenseDialog({
  expense,
  categories,
  onClose,
  onDone,
}: {
  expense: Expense | null;
  categories: ExpenseCategory[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    category_id: String(expense?.category_id ?? categories[0]?.id ?? ""),
    title: expense?.title ?? "",
    vendor: expense?.vendor ?? "",
    spent_on: expense?.spent_on ?? "",
    amount: expense?.amount ?? "",
    tax_amount: expense?.tax_amount ?? "0",
    payment_mode: expense?.payment_mode ?? "bank",
    invoice_number: expense?.invoice_number ?? "",
    gstin: expense?.gstin ?? "",
    status: expense?.status ?? "recorded",
    paid_on: expense?.paid_on ?? "",
    description: expense?.description ?? "",
  });
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const total = Number(form.amount || 0) + Number(form.tax_amount || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        category_id: Number(form.category_id),
        title: form.title.trim(),
        vendor: form.vendor.trim() || null,
        spent_on: form.spent_on,
        amount: form.amount,
        tax_amount: form.tax_amount || "0",
        payment_mode: form.payment_mode,
        invoice_number: form.invoice_number.trim() || null,
        gstin: form.gstin.trim() || null,
        status: form.status,
        paid_on: form.paid_on || null,
        description: form.description.trim() || null,
      };

      const saved = expense
        ? await updateExpense(expense.id, payload)
        : await createExpense(payload);

      if (receipt) await attachReceipt(saved.id, receipt);

      toast.success(expense ? "Expense updated" : `Recorded ${saved.reference}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {expense ? `Edit ${expense.reference}` : "Record an expense"}
          </DialogTitle>
          <DialogDescription>
            What the company spent. Staff reimbursements belong under Payroll.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select
                value={form.category_id}
                onValueChange={(v) => set("category_id", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">What was it</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Office rent — November"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date</Label>
              <Input
                type="date"
                required
                value={form.spent_on}
                onChange={(e) => set("spent_on", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tax</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.tax_amount}
                onChange={(e) => set("tax_amount", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Total</Label>
              <Input value={rupees(total, 2)} disabled />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Vendor</Label>
              <Input
                value={form.vendor}
                onChange={(e) => set("vendor", e.target.value)}
                placeholder="Who was paid"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Invoice number</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => set("invoice_number", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Vendor GSTIN</Label>
              <Input
                value={form.gstin}
                onChange={(e) => set("gstin", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Paid by</Label>
              <Select
                value={form.payment_mode}
                onValueChange={(v) => set("payment_mode", v)}
              >
                <SelectTrigger className="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Paid on</Label>
              <Input
                type="date"
                value={form.paid_on}
                onChange={(e) => set("paid_on", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Receipt</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
              {expense?.receipt_path && !receipt && (
                <p className="text-[11px] text-foreground/70">
                  One is already attached — choosing a file replaces it.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !form.title.trim() || !form.spent_on || !form.amount}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Receipt className="size-4" />
              )}
              {expense ? "Save changes" : "Record it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryManager({
  categories,
  onChanged,
}: {
  categories: ExpenseCategory[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState({ name: "", code: "", monthly_budget: "" });
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await saveExpenseCategory(null, {
        name: draft.name.trim(),
        code: draft.code.trim() || draft.name.trim().slice(0, 12),
        monthly_budget: draft.monthly_budget || null,
        is_active: true,
        sort_order: categories.length,
      });
      setDraft({ name: "", code: "", monthly_budget: "" });
      toast.success("Category added");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <h2 className="text-sm font-bold">Categories and budgets</h2>
      <p className="mt-0.5 text-[11px] text-foreground/70">
        A budget is per month. Going over it only colours the bar — nothing is
        blocked.
      </p>

      <ul className="mt-3 space-y-1.5">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold">{c.name}</span>
              <span className="block font-mono text-[10px] text-foreground/70">
                {c.code} · {rupees(c.spent_this_month, 0)} this month
              </span>
            </span>

            <Input
              type="number"
              min="0"
              defaultValue={c.monthly_budget ?? ""}
              placeholder="No budget"
              className="h-8 w-32 text-xs"
              onBlur={async (e) => {
                const value = e.target.value;
                if ((c.monthly_budget ?? "") === value) return;
                await saveExpenseCategory(c.id, {
                  name: c.name,
                  code: c.code,
                  monthly_budget: value || null,
                  note: c.note,
                  is_active: c.is_active,
                  sort_order: c.sort_order,
                }).catch(() => toast.error("Could not save the budget"));
                onChanged();
              }}
            />

            <IconButton
              label="Delete category"
              icon={Trash2}
              size="sm"
              variant="destructive"
              onClick={async () => {
                try {
                  await deleteExpenseCategory(c.id);
                  toast.success("Category removed");
                  onChanged();
                } catch (err) {
                  toast.error(
                    err instanceof ApiError ? err.message : "Could not remove it",
                  );
                }
              }}
            />
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="New category"
          className="h-8 w-48 text-xs"
        />
        <Input
          value={draft.code}
          onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          placeholder="CODE"
          className="h-8 w-28 font-mono text-xs"
        />
        <Input
          type="number"
          value={draft.monthly_budget}
          onChange={(e) => setDraft({ ...draft, monthly_budget: e.target.value })}
          placeholder="Budget"
          className="h-8 w-32 text-xs"
        />
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={busy || !draft.name.trim()}
          onClick={add}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Add
        </Button>
      </div>
    </section>
  );
}
