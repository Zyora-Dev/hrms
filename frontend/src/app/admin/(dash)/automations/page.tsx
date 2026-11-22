import type { Metadata } from "next";

import { AutomationsList } from "@/components/admin/automations/automations-list";

export const metadata: Metadata = { title: "Automations · HRMS" };

export default function AutomationsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="mt-1 text-sm text-foreground/80">
          Work the server does on its own — fetching punches, accruing leave,
          reminding you, backing up. Switch one on, set when it runs, or press
          it now and watch what it says.
        </p>
      </div>

      <AutomationsList />
    </div>
  );
}
