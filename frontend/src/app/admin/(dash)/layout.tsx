import { AdminShell } from "@/components/admin/shell/admin-shell";

export default function AdminDashLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
