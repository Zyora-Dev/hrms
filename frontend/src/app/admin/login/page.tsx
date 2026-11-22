import type { Metadata } from "next";

import { LoginForm } from "@/components/admin/login-form";
import { LoginAside } from "@/components/admin/login-aside";

export const metadata: Metadata = {
  title: "Admin sign in · HRMS",
  description: "Sign in to the HRMS admin console.",
};

export default function AdminLoginPage() {
  return (
    <div className="dark flex min-h-dvh flex-1 bg-background p-3 sm:p-4 text-foreground">
      <div className="grid w-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 lg:grid-cols-2">
        <LoginForm />
        <LoginAside />
      </div>
    </div>
  );
}
