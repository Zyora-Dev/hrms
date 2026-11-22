import type { Metadata } from "next";
import { Suspense } from "react";

import { PayrollTabs } from "@/components/admin/payroll/payroll-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Payroll · HRMS" };

export default function PayrollPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each run reads the month&apos;s attendance and applies your salary
          structure, leave policy and statutory rates.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-5">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
        }
      >
        <PayrollTabs />
      </Suspense>
    </div>
  );
}
