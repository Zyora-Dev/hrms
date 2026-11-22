import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EmployeeForm } from "@/components/admin/employees/employee-form";

export const metadata: Metadata = { title: "Add employee · HRMS" };

export default function NewEmployeePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/admin/employees"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Employees
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Add employee
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete each step. The photo and documents can be uploaded once the
          record is created.
        </p>
      </div>

      <EmployeeForm />
    </div>
  );
}
