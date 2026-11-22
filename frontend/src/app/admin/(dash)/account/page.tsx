import type { Metadata } from "next";

import { AccountView } from "@/components/admin/account/account-view";

export const metadata: Metadata = { title: "Account · HRMS" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your password, two-step sign-in and the devices holding a session.
        </p>
      </div>

      <AccountView />
    </div>
  );
}
