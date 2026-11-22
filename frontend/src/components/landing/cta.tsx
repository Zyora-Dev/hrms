import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Cta() {
  return (
    <section className="px-6 pb-20 sm:pb-28">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/15 to-card px-6 py-16 text-center sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-64 bg-[radial-gradient(50%_60%_at_50%_50%,var(--color-primary)_0%,transparent_70%)] opacity-25 blur-2xl"
        />
        <h2 className="relative text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Make the shift to HR that runs itself
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Start with employee records and attendance today. Add payroll and
          automations when you&apos;re ready.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="w-full sm:w-auto" asChild>
            <Link href="/admin/login">
              Start free trial
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            asChild
          >
            <Link href="/admin/login">Talk to sales</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
