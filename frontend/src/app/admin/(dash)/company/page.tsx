import type { Metadata } from "next";

import { CompanyProfile } from "@/components/admin/company/company-profile";

export const metadata: Metadata = {
  title: "Company · HRMS",
};

export default function CompanyPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your organisation&apos;s profile, used across payslips, letters and
          compliance reports.
        </p>
      </div>

      <CompanyProfile />
    </div>
  );
}
