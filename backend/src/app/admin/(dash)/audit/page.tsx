import type { Metadata } from "next";

import { AuditTrail } from "@/components/admin/audit/audit-trail";

export const metadata: Metadata = { title: "Audit trail · HRMS" };

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every change, who made it and what it was before. Entries are written
          as work happens and are never edited or removed.
        </p>
      </div>

      <AuditTrail />
    </div>
  );
}
