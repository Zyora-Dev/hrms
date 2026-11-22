"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CalendarOff,
  Fingerprint,
  FileSignature,
  IdCard,
  ListTree,
  Mail,
  Percent,
  ReceiptText,
  UserCog,
  Wallet,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendanceSettingsPanel } from "./attendance-settings";
import { DeviceSettingsPanel } from "./device-settings";
import { EmailSettingsPanel } from "./email-settings";
import { EmployeeSettingsPanel } from "./employee-settings";
import { LookupManager } from "./lookup-manager";
import { LeavePolicyPanel } from "./leave-policy";
import { PayrollSettingsPanel } from "./payroll-settings";
import { PayslipEditor } from "./payslip-editor";
import { TaxSettingsPanel } from "./tax-settings";
import { TeamSettingsPanel } from "./team-settings";
import { TemplateManager } from "./template-manager";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { value: "employee", label: "Employee", icon: IdCard },
  { value: "attendance", label: "Attendance", icon: CalendarClock },
  { value: "devices", label: "Devices", icon: Fingerprint },
  { value: "leave", label: "Leave policy", icon: CalendarOff },
  { value: "payroll", label: "Payroll", icon: Wallet },
  { value: "tax", label: "Income tax", icon: Percent },
  { value: "payslip", label: "Payslip design", icon: ReceiptText },
  { value: "lists", label: "Lists", icon: ListTree },
  { value: "letters", label: "Letter templates", icon: FileSignature },
  { value: "email", label: "Email", icon: Mail },
  { value: "team", label: "Admins & backups", icon: UserCog },
] as const;

const VALUES = SECTIONS.map((s) => s.value) as readonly string[];
const DEFAULT_TAB = SECTIONS[0].value;

// Vertical rail beside the panel on desktop, stacked above it on a phone.
const RAIL = cn(
  "h-fit w-full shrink-0 gap-1 rounded-xl border border-border/70",
  "bg-muted/40 p-2 md:w-60",
);

const ITEM = cn(
  "group h-9 w-full flex-none justify-start gap-2.5 rounded-lg px-3",
  "text-sm font-medium text-muted-foreground transition-colors",
  "hover:bg-background hover:text-foreground",
  "data-active:bg-brand-ink data-active:font-semibold data-active:text-white",
  "data-active:shadow-sm data-active:hover:bg-brand-ink data-active:hover:text-white",
);

export function SettingsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const tab = VALUES.includes(requested ?? "")
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
    <Tabs
      orientation="vertical"
      value={tab}
      onValueChange={setTab}
      className="max-md:flex-col md:gap-6"
    >
      <div className="md:sticky md:top-20 md:h-fit">
        <p className="mb-2 hidden px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:block">
          Sections
        </p>
        <TabsList className={RAIL}>
          {SECTIONS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className={ITEM}>
              <Icon className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="min-w-0 flex-1">
        <TabsContent value="employee">
          <EmployeeSettingsPanel />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceSettingsPanel />
        </TabsContent>

        <TabsContent value="devices">
          <DeviceSettingsPanel />
        </TabsContent>

        <TabsContent value="leave">
          <LeavePolicyPanel />
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollSettingsPanel />
        </TabsContent>

        <TabsContent value="tax">
          <TaxSettingsPanel />
        </TabsContent>

        <TabsContent value="payslip">
          <PayslipEditor />
        </TabsContent>

        <TabsContent value="lists">
          <div className="grid gap-6 xl:grid-cols-2">
            <LookupManager
              kind="departments"
              title="Departments"
              description="Archive one to hide it from new entries without affecting existing employees."
              placeholder="e.g. Engineering"
            />
            <LookupManager
              kind="designations"
              title="Designations"
              description="Job titles offered when adding or editing an employee."
              placeholder="e.g. Senior Engineer"
            />
          </div>
        </TabsContent>

        <TabsContent value="letters">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="email">
          <EmailSettingsPanel />
        </TabsContent>

        <TabsContent value="team">
          <TeamSettingsPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}
