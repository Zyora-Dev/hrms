"use client";

import Link from "next/link";
import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CircleDollarSign,
  FileSignature,
  Paperclip,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Section } from "@/components/admin/company/section";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalAccess } from "./portal-access";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { DocumentsPanel } from "./documents-panel";
import { LettersPanel } from "./letters-panel";
import { PhotoUploader } from "./photo-uploader";
import {
  ApiError,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  deleteEmployee,
  formatCurrency,
  formatDate,
  getEmployee,
  revealAadhaar,
  labelOf,
  statusTone,
  type Employee,
} from "./shared";
import { cn } from "@/lib/utils";

// Segmented control: a soft tray with a dark blue pill for the active tab.
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

const TAB_COUNT = cn(
  "ml-0.5 rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-brand-ink",
  "transition-colors group-data-[state=active]:bg-white/20",
  "group-data-[state=active]:text-white",
);

const TABS = ["overview", "payroll", "letters", "documents"] as const;
const DEFAULT_TAB = TABS[0];

export function EmployeeDetail() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = Number(useParams<{ id: string }>().id);

  // The tab lives in the URL so a profile view can be linked and survives a
  // refresh. `replace` keeps tab switching out of the browser history.
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
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getEmployee(id)
      .then((e) => active && setEmployee(e))
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Could not load employee");
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function onDelete() {
    if (!employee) return;
    if (
      !window.confirm(
        `Delete ${employee.full_name} (${employee.employee_code})? This also removes their photo and documents, and cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteEmployee(employee.id);
      toast.success(`${employee.full_name} deleted`);
      router.push("/admin/employees");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete employee");
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm font-medium text-destructive">
        {error}
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-5 rounded-xl border border-border/60 bg-card p-5 sm:p-6">
        <PhotoUploader employee={employee} onChange={setEmployee} />

        <div className="flex h-9 items-center gap-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="secondary" className="font-mono font-semibold">
              {employee.employee_code}
            </Badge>
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                statusTone(employee.status),
              )}
            >
              {labelOf(EMPLOYEE_STATUSES, employee.status)}
            </span>
          </div>

          <IconButton
            label="Back to list"
            icon={ArrowLeft}
            variant="neutral"
            onClick={() => router.push("/admin/employees")}
          />
          <Link href={`/admin/employees/${employee.id}/edit`}>
            <IconButton label="Edit employee" icon={Pencil} variant="brand" />
          </Link>
          <IconButton
            label="Delete employee"
            icon={Trash2}
            variant="destructive"
            onClick={onDelete}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className={TAB_LIST}>
          <TabsTrigger value="overview" className={TAB}>
            <User className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="payroll" className={TAB}>
            <CircleDollarSign className="size-4" />
            Payroll
          </TabsTrigger>
          <TabsTrigger value="letters" className={TAB}>
            <FileSignature className="size-4" />
            Generate letter
          </TabsTrigger>
          <TabsTrigger value="documents" className={TAB}>
            <Paperclip className="size-4" />
            Documents
            {employee.documents.length > 0 && (
              <span className={TAB_COUNT}>{employee.documents.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Section title="Personal details" description="Basic identity information.">
            <Row label="Full name" value={employee.full_name} />
            <Row label="Gender" value={labelOf(GENDERS, employee.gender)} />
            <Row label="Date of birth" value={formatDate(employee.date_of_birth)} />
            <Row label="Blood group" value={employee.blood_group} />
            <Row
              label="Marital status"
              value={labelOf(MARITAL_STATUSES, employee.marital_status)}
            />
          </Section>

          <Section title="Contact" description="How to reach the employee.">
            <Row label="Work email" value={employee.work_email} />
            <Row label="Personal email" value={employee.personal_email} />
            <Row label="Mobile" value={employee.phone} />
            <Row label="Alternate phone" value={employee.alternate_phone} />
            <Row
              label="Current address"
              value={employee.current_address}
              className="sm:col-span-2"
            />
            <Row
              label="Permanent address"
              value={employee.permanent_address}
              className="sm:col-span-2"
            />
            <Row label="Emergency contact" value={employee.emergency_contact_name} />
            <Row label="Relationship" value={employee.emergency_contact_relation} />
            <Row label="Emergency phone" value={employee.emergency_contact_phone} />
          </Section>

          <Section title="Employment" description="Role, reporting line and key dates.">
            <Row label="Designation" value={employee.designation} />
            <Row label="Department" value={employee.department} />
            <Row
              label="Employment type"
              value={labelOf(EMPLOYMENT_TYPES, employee.employment_type)}
            />
            <Row label="Work location" value={employee.work_location} />
            <Row label="Reporting manager" value={employee.reporting_manager_name} />
            <Row label="Date of joining" value={formatDate(employee.date_of_joining)} />
            <Row
              label="Probation end date"
              value={formatDate(employee.probation_end_date)}
            />
            <Row label="Date of exit" value={formatDate(employee.date_of_exit)} />
          </Section>

          <PortalAccess employeeId={employee.id} />
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6">
          <Section title="Compensation & statutory" description="Used by payroll.">
            <Row label="Annual CTC" value={formatCurrency(employee.ctc_annual)} />
            <Row label="PAN" value={employee.pan} mono />
            <AadhaarRow employee={employee} />
            <Row label="UAN" value={employee.uan} mono />
            <Row label="PF number" value={employee.pf_number} mono />
            <Row label="ESIC number" value={employee.esic_number} mono />
          </Section>

          <Section title="Bank account" description="Where salary is credited.">
            <Row label="Account holder" value={employee.bank_account_name} />
            <Row label="Account number" value={employee.bank_account_number} mono />
            <Row label="IFSC" value={employee.bank_ifsc} mono />
            <Row label="Bank name" value={employee.bank_name} />
          </Section>
        </TabsContent>

        <TabsContent value="letters">
          <LettersPanel
            employee={employee}
            onGenerated={(doc) =>
              setEmployee({ ...employee, documents: [...employee.documents, doc] })
            }
          />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel
            employee={employee}
            onChange={(documents) => setEmployee({ ...employee, documents })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AadhaarRow({ employee }: { employee: Employee }) {
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-foreground/70">Aadhaar</dt>
      <dd className="mt-0.5 flex items-center gap-2 font-mono text-sm font-medium">
        {full ?? employee.aadhaar_masked ?? "—"}
        {!full && employee.aadhaar_masked && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setFull(await revealAadhaar(employee.id));
              } catch (err) {
                toast.error(
                  err instanceof ApiError ? err.message : "Not available",
                );
              } finally {
                setBusy(false);
              }
            }}
            className="font-sans text-[11px] font-semibold text-brand-ink hover:underline"
          >
            {busy ? "…" : "Reveal"}
          </button>
        )}
      </dd>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {value ? (
        <p
          className={cn(
            "mt-1 text-sm font-semibold whitespace-pre-line text-foreground",
            mono && "font-mono",
          )}
        >
          {value}
        </p>
      ) : (
        <Badge variant="outline" className="mt-1.5 text-muted-foreground">
          Not set
        </Badge>
      )}
    </div>
  );
}
