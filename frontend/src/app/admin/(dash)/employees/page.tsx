import type { Metadata } from "next";

import { EmployeeList } from "@/components/admin/employees/employee-list";

export const metadata: Metadata = { title: "Employees · HRMS" };

export default function EmployeesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone on the payroll, with their role, department and status.
        </p>
      </div>

      <EmployeeList />
    </div>
  );
}
