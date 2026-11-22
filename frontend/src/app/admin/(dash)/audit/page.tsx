import type { Metadata } from "next";
import { Suspense } from "react";

import { AuditTrail } from "@/components/admin/audit/audit-trail";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Audit trail · HRMS" };

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every change, who made it and what it was before. Entries are written
          as work happens, and nothing in the system edits or removes them.
        </p>
      </div>

      {/* The default date range is read off the clock, which is dynamic. */}
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <AuditTrail />
      </Suspense>
    </div>
  );
}
