"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ACCOUNT_NAV,
  PRIMARY_NAV,
  SECONDARY_NAV,
  type NavItem,
} from "./nav-items";
import { badgeFor, useBadges } from "./badges";
import { useCurrentAdmin } from "./current-admin";
import { useSidebar } from "./sidebar-state";
import { can, clearToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <>
      {/* mobile scrim */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden",
          mobileOpen ? "block" : "hidden",
        )}
      />
      <aside
        className={cn(
          // `dark` scopes the dark palette to the rail, so its contents stay
          // legible on navy while the rest of the admin area is light.
          // Fixed at every width: the rail stays put while the page scrolls,
          // so the nav and the account card are always reachable. The shell
          // pads its content by the same width.
          "dark fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar text-foreground transition-[width,transform] duration-200 ease-out",
          "lg:translate-x-0 rail:lg:w-[4.75rem]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarBrand />

        {/* usePathname() is dynamic on dynamic routes, so the active state is
            isolated behind a boundary; the shell renders the same nav without
            a highlighted item. */}
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNavLinks />
        </Suspense>

        <SidebarAccountCard />
      </aside>
    </>
  );
}

function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  const admin = useCurrentAdmin();

  // Anything the signed-in admin cannot read is simply not shown, rather
  // than offered and then refused.
  const visible = (items: NavItem[]) =>
    items.filter(
      (item) => !item.module || admin === null || can(admin, item.module),
    );

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {visible(PRIMARY_NAV).map((item) => (
        <SidebarLink key={item.href} item={item} pathname={pathname} />
      ))}

      <div className="!my-4 border-t border-border/60" />

      {visible(SECONDARY_NAV).map((item) => (
        <SidebarLink key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-16 items-center gap-2.5 border-b border-border/60 px-5 rail:lg:justify-center rail:lg:px-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-inset ring-primary/30">
        <svg viewBox="0 0 24 24" fill="none" className="size-4 text-primary">
          <path
            d="M4 19V7.5a1 1 0 0 1 .6-.92l6.8-2.9a1 1 0 0 1 1.4.92V19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12.8 19V10l5.6 2.2a1 1 0 0 1 .6.93V19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M3 19h18" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </span>
      <span className="text-[0.95rem] font-semibold tracking-tight rail:lg:hidden">
        HR<span className="text-primary">MS</span>
      </span>
    </div>
  );
}

function SidebarLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string | null;
}) {
  const { setMobileOpen } = useSidebar();
  const { summary } = useBadges();
  const Icon = item.icon;
  const waiting = badgeFor(item.href, summary);
  const active =
    pathname !== null &&
    (pathname === item.href || pathname.startsWith(`${item.href}/`));

  const link = (
    <Link
      href={item.href}
      onClick={() => setMobileOpen(false)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        "rail:lg:justify-center rail:lg:px-0",
        active
          ? "bg-white font-semibold text-brand-ink shadow-sm"
          : "text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate rail:lg:hidden">{item.label}</span>

      {waiting > 0 && (
        <span
          className={cn(
            "ml-auto flex min-w-5 items-center justify-center rounded-full px-1.5",
            "text-[10px] font-bold leading-5",
            active ? "bg-brand-ink text-white" : "bg-destructive text-white",
            // On the collapsed rail the label is gone, so the count rides
            // the icon instead of sitting beside it.
            "rail:lg:absolute rail:lg:right-1 rail:lg:top-1 rail:lg:ml-0",
          )}
        >
          {waiting > 99 ? "99+" : waiting}
        </span>
      )}
    </Link>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="rail-open:lg:hidden">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

const CARD_ROW = cn(
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors",
  "hover:bg-white/10 hover:text-white rail:lg:justify-center rail:lg:px-0",
);

function SidebarAccountCard() {
  const router = useRouter();
  const { setMobileOpen } = useSidebar();

  function onLogout() {
    clearToken();
    router.replace("/admin/login");
  }

  return (
    <div className="shrink-0 p-3 rail:lg:px-2">
      <div className="rounded-xl border border-white/10 bg-white/5 p-1.5 rail:lg:p-1">
        {ACCOUNT_NAV.map(({ label, href, icon: Icon }) => (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <Link
                href={href}
                onClick={() => setMobileOpen(false)}
                className={CARD_ROW}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="truncate rail:lg:hidden">{label}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="rail-open:lg:hidden">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}

        <div className="my-1 border-t border-white/10" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onLogout}
              className={cn(
                CARD_ROW,
                "hover:bg-destructive/15 hover:text-destructive",
              )}
            >
              <LogOut className="size-[18px] shrink-0" />
              <span className="rail:lg:hidden">Sign out</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="rail-open:lg:hidden">
            Sign out
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
