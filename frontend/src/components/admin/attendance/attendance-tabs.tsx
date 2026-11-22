"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarHeart, ClipboardList } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HolidayCalendar } from "@/components/admin/holidays/holiday-calendar";
import { AttendanceRegister } from "./attendance-register";
import { cn } from "@/lib/utils";

const TABS = ["register", "holidays"] as const;
const DEFAULT_TAB = TABS[0];

const TAB_LIST = cn(
  "w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/70",
  "bg-muted/40 p-1.5 group-data-horizontal/tabs:h-auto",
);

const TAB = cn(
  "group h-9 flex-none gap-2 rounded-lg px-3.5 text-sm font-medium",
  "text-muted-foreground transition-colors",
  "hover:bg-background hover:text-foreground",
  "data-active:bg-brand-ink data-active:font-semibold data-active:text-white",
  "data-active:shadow-sm data-active:hover:bg-brand-ink data-active:hover:text-white",
);

export function AttendanceTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const tab = TABS.includes(requested as (typeof TABS)[number])
    ? (requested as string)
    : DEFAULT_TAB;

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TAB) next.delete("tab");
    else next.set("tab", value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-5">
      <TabsList className={TAB_LIST}>
        <TabsTrigger value="register" className={TAB}>
          <ClipboardList className="size-4" />
          Register
        </TabsTrigger>
        <TabsTrigger value="holidays" className={TAB}>
          <CalendarHeart className="size-4" />
          Holidays
        </TabsTrigger>
      </TabsList>

      <TabsContent value="register">
        <AttendanceRegister />
      </TabsContent>
      <TabsContent value="holidays">
        <HolidayCalendar />
      </TabsContent>
    </Tabs>
  );
}
