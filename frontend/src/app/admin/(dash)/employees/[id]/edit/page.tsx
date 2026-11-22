import type { Metadata } from "next";
import { Suspense } from "react";

import { EmployeeEdit } from "@/components/admin/employees/employee-edit";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Edit employee · HRMS" };

export default function EditEmployeePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <EmployeeEdit />
      </Suspense>
    </div>
  );
}
