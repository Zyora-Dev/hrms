import type { Metadata } from "next";
import { Suspense } from "react";

import { ReportsTabs } from "@/components/admin/reports/reports-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Reports · HRMS" };

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Attendance, payroll, statutory dues, leave, headcount and money still
          owed back — each over whatever period you choose, and each downloadable
          as it stands on screen.
        </p>
      </div>

      {/* The tab and the default dates both come from outside render. */}
      <Suspense
        fallback={
          <div className="space-y-5">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <ReportsTabs />
      </Suspense>
    </div>
  );
}
