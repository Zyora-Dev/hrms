import type { Metadata } from "next";
import { Suspense } from "react";

import { PortalShell } from "@/components/employee/portal-shell";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "My HRMS" };

export default function EmployeePortalPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-5 px-6 py-16">
          <Skeleton className="h-12 w-64 rounded-lg" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      }
    >
      <PortalShell />
    </Suspense>
  );
}
