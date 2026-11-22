import type { Metadata } from "next";
import { Suspense } from "react";

import { LeaveTabs } from "@/components/admin/leave/leave-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Leave · HRMS" };

export default function LeavePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leave</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approved leave marks the attendance day, which is what payroll pays
          for. Policy lives in Settings.
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
        <LeaveTabs />
      </Suspense>
    </div>
  );
}
