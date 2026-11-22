import type { Metadata } from "next";
import { Suspense } from "react";

import { EmployeeDetail } from "@/components/admin/employees/employee-detail";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Employee · HRMS" };

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-52 w-full rounded-xl" />
    </div>
  );
}

export default function EmployeePage() {
  return (
    <div className="mx-auto max-w-5xl">
      {/* EmployeeDetail reads the id with useParams(), which is dynamic —
          the boundary gives the static shell something to render. */}
      <Suspense fallback={<DetailSkeleton />}>
        <EmployeeDetail />
      </Suspense>
    </div>
  );
}
