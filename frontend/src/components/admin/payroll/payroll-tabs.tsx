"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  Banknote,
  HandCoins,
  Landmark,
  Percent,
  Receipt,
  Wallet,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatutoryBonus } from "@/components/admin/bonus/statutory-bonus";
import { AdvancesList } from "@/components/admin/advances/advances-list";
import { LoansList } from "@/components/admin/loans/loans-list";
import { TdsChallans } from "@/components/admin/tds/tds-challans";
import { TaxOverview } from "@/components/admin/tax/tax-overview";
import { ClaimsInbox } from "@/components/admin/claims/claims-inbox";
import { PayrollRuns } from "./payroll-runs";
import { cn } from "@/lib/utils";

const TABS = [
  "runs",
  "advances",
  "loans",
  "claims",
  "bonus",
  "incometax",
  "tds",
] as const;
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

export function PayrollTabs() {
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
        <TabsTrigger value="runs" className={TAB}>
          <Wallet className="size-4" />
          Pay runs
        </TabsTrigger>
        <TabsTrigger value="advances" className={TAB}>
          <Banknote className="size-4" />
          Salary advances
        </TabsTrigger>
        <TabsTrigger value="loans" className={TAB}>
          <HandCoins className="size-4" />
          Loans
        </TabsTrigger>
        <TabsTrigger value="claims" className={TAB}>
          <Receipt className="size-4" />
          Reimbursements
        </TabsTrigger>
        <TabsTrigger value="bonus" className={TAB}>
          <Award className="size-4" />
          Statutory bonus
        </TabsTrigger>
        <TabsTrigger value="incometax" className={TAB}>
          <Percent className="size-4" />
          Income tax
        </TabsTrigger>
        <TabsTrigger value="tds" className={TAB}>
          <Landmark className="size-4" />
          TDS challans
        </TabsTrigger>
      </TabsList>

      <TabsContent value="runs">
        <PayrollRuns />
      </TabsContent>
      <TabsContent value="advances">
        <AdvancesList />
      </TabsContent>
      <TabsContent value="loans">
        <LoansList />
      </TabsContent>
      <TabsContent value="claims">
        <ClaimsInbox />
      </TabsContent>
      <TabsContent value="bonus">
        <StatutoryBonus />
      </TabsContent>
      <TabsContent value="incometax">
        <TaxOverview />
      </TabsContent>
      <TabsContent value="tds">
        <TdsChallans />
      </TabsContent>
    </Tabs>
  );
}
