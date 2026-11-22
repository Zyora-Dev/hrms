import Link from "next/link";

import { Logo } from "@/components/landing/logo";

// Static so the page stays prerenderable — `new Date()` is not allowed at build time.
const COPYRIGHT_YEAR = 2026;

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Core HR", href: "#platform" },
      { label: "Payroll", href: "#payroll" },
      { label: "Attendance", href: "#attendance" },
      { label: "Automations", href: "#automations" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "API reference", href: "#" },
      { label: "Support", href: "#" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Security", href: "#" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2.6fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Employee management, payroll and attendance in a single system
              your whole company can use.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/70">
                  {col.heading}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {COPYRIGHT_YEAR} HRMS. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built for teams that would rather not maintain a spreadsheet.
          </p>
        </div>
      </div>
    </footer>
  );
}
