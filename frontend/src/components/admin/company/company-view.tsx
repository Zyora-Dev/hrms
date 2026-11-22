import { Badge } from "@/components/ui/badge";
import { companyTypeLabel, type Company } from "@/lib/company";
import { Section } from "./section";

export function CompanyView({ company }: { company: Company }) {
  return (
    <div className="space-y-6">
      <Section
        title="Identity"
        description="How the company is named and referenced across the system."
      >
        <Row label="Company name" value={company.name} />
        <Row label="Unique ID" value={company.company_uid} mono />
        <Row label="Slug" value={company.slug} mono />
        <Row label="Company type" value={companyTypeLabel(company.company_type)} />
      </Section>

      <Section title="Contact" description="Where official correspondence is sent.">
        <Row label="Email" value={company.email} />
        <Row label="Mobile / phone" value={company.phone} />
        <Row label="Registered address" value={company.address} className="sm:col-span-2" />
      </Section>

      <Section
        title="Statutory registrations"
        description="Required for payroll, payslips and compliance filings."
      >
        <Row label="GSTIN" value={company.gstin} mono />
        <Row label="PAN" value={company.pan} mono />
        <Row label="CIN" value={company.cin} mono />
        <Row label="TAN" value={company.tan} mono />
        <Row label="PF establishment code" value={company.pf_code} mono />
        <Row label="ESIC code" value={company.esic_code} mono />
        <Row label="Professional tax number" value={company.pt_number} mono />
      </Section>
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
          className={`mt-1 text-sm font-semibold whitespace-pre-line text-foreground ${
            mono ? "font-mono" : ""
          }`}
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
