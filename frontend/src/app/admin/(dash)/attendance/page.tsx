import type { Metadata } from "next";
import { Suspense } from "react";

import { AttendanceTabs } from "@/components/admin/attendance/attendance-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Attendance · HRMS" };

export default function AttendancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Punches arrive from the biometric device and can be added by hand;
          both feed the same engine, so continued shifts and holidays are worked
          out on their own. Any day can be marked or cleared by hand when the
          scans do not tell the whole story.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-5">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <AttendanceTabs />
      </Suspense>
    </div>
  );
}
