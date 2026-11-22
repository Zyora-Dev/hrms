import type { Metadata } from "next";
import { Suspense } from "react";

import { SettingsTabs } from "@/components/admin/settings/settings-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Settings · HRMS" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Policy that drives attendance and payroll, plus the lists and
          templates used across the system.
        </p>
      </div>

      {/* Section state lives in the URL, so the hooks reading it are dynamic. */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-6 md:flex-row">
            <Skeleton className="h-80 w-full shrink-0 rounded-xl md:w-60" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <SettingsTabs />
      </Suspense>
    </div>
  );
}
