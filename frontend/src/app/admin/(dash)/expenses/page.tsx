import type { Metadata } from "next";

import { ExpensesView } from "@/components/admin/expenses/expenses-view";

export const metadata: Metadata = { title: "Expenses · HRMS" };

export default function ExpensesPage() {
  // The heading lives inside the view so the page-level actions can sit
  // beside it rather than wrapping onto a line of their own.
  return <ExpensesView />;
}
