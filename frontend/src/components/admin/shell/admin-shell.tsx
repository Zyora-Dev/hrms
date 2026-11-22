"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "./app-header";
import { BadgeProvider } from "./badges";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./sidebar-state";
import { clearToken, fetchMe, type Admin } from "@/lib/auth";
import { AdminProvider } from "./current-admin";
import { cn } from "@/lib/utils";

/**
 * Client-side session gate. This is a UX guard only — the API is the real
 * boundary, every admin endpoint must verify the bearer token server-side.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Admin | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMe().then((admin) => {
      if (!active) return;
      if (!admin) {
        clearToken();
        router.replace("/admin/login");
        return;
      }
      setMe(admin);
      setEmail(admin.email);
      setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider>
        <AdminProvider value={me}>
        <BadgeProvider>
        <div className="relative flex min-h-dvh flex-1">
          <AppSidebar />
          {/* The rail is fixed, so the content is inset by its width. */}
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out",
              "lg:pl-64 rail:lg:pl-[4.75rem]",
            )}
          >
            <AppHeader email={email} />
            <main className="flex-1 p-4 sm:p-6">{children}</main>
          </div>

          <Toaster position="bottom-right" />

          {/* Covers the shell until the session is confirmed. */}
          {!checked && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="sr-only">Checking your session…</span>
            </div>
          )}
        </div>
        </BadgeProvider>
        </AdminProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
