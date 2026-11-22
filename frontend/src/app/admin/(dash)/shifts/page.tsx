import type { Metadata } from "next";
import { Suspense } from "react";

import { ShiftsTabs } from "@/components/admin/shifts/shifts-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Shifts · HRMS" };

export default function ShiftsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shifts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define working hours, chart the rotation, and review every shift
          change an employee has had.
        </p>
      </div>

      {/* Tab state lives in the URL, so the hooks reading it are dynamic. */}
      <Suspense
        fallback={
          <div className="space-y-5">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
        }
      >
        <ShiftsTabs />
      </Suspense>
    </div>
  );
}
