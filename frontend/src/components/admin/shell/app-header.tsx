"use client";

import { useRouter } from "next/navigation";
import { Mail, PanelLeft, Search } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HeaderClock } from "./header-clock";
import { NotificationBell } from "./notification-bell";
import { useSidebar } from "./sidebar-state";
import { clearToken } from "@/lib/auth";

export function AppHeader({ email }: { email: string | null }) {
  const router = useRouter();
  const { collapsed, toggleCollapsed, setMobileOpen } = useSidebar();

  const initials = email ? email.slice(0, 2).toUpperCase() : "AD";

  function onLogout() {
    clearToken();
    router.replace("/admin/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      {/* collapse toggle — desktop collapses the rail, mobile opens the drawer */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (window.matchMedia("(min-width: 1024px)").matches) {
                toggleCollapsed();
              } else {
                setMobileOpen(true);
              }
            }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <PanelLeft className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {collapsed ? "Expand sidebar" : "Collapse sidebar"}
        </TooltipContent>
      </Tooltip>

      <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search employees, payslips…"
          aria-label="Search"
          className="h-9 w-full rounded-lg border border-border/60 bg-muted/40 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:bg-muted/60 focus:ring-[3px] focus:ring-primary/20"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <HeaderClock />
        <IconButton label="Messages" icon={Mail} />
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent/60"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-sm font-medium">Administrator</span>
                <span className="block text-xs text-muted-foreground">
                  {email ?? "—"}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-medium">Administrator</span>
              <span className="block text-xs text-muted-foreground">
                {email ?? "—"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Organisation settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onLogout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function IconButton({
  label,
  icon: Icon,
  dot,
}: {
  label: string;
  icon: React.ElementType;
  dot?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="relative hidden size-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
        >
          <Icon className="size-4" />
          {dot && (
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary ring-2 ring-background" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
