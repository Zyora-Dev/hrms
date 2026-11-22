import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "What is an HRMS?",
    a: "A Human Resource Management System is the single system of record for your people — employee data, attendance, leave, payroll and performance — replacing the spreadsheets and disconnected tools most teams start with.",
  },
  {
    q: "How long does implementation take?",
    a: "Most teams import their employee data and run their first payroll cycle within a week. Attendance devices and custom approval chains are usually configured in the same period.",
  },
  {
    q: "Can we migrate our existing employee data?",
    a: "Yes. Bulk import from CSV or Excel covers profiles, salary structures and leave balances, and historical payroll records can be loaded so your reports stay continuous.",
  },
  {
    q: "Does payroll handle statutory compliance?",
    a: "PF, ESI, professional tax and TDS are computed on each run against current rates, with the filing-ready reports generated alongside payslips.",
  },
  {
    q: "How is employee data secured?",
    a: "Data is encrypted in transit and at rest, access is role-based so managers only see their own reports, and every change to a record is written to an audit log.",
  },
  {
    q: "Can it integrate with our other tools?",
    a: "A REST API and webhooks cover accounting, identity providers and attendance hardware, so events like a new hire or a closed pay run can trigger work in your other systems.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Questions, answered
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            Still unsure about something? Our team will walk you through it on a
            30-minute call.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left text-base">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
