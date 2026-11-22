import type { Metadata } from "next";

import { DashboardView } from "@/components/admin/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard · HRMS",
};

export default function DashboardPage() {
  return <DashboardView />;
}
