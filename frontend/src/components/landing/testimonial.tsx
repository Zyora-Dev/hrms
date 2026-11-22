import { Quote } from "lucide-react";

export function Testimonial() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 sm:py-24">
      <figure className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border/60 bg-card p-8 sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/15 blur-3xl"
        />
        <Quote className="size-8 text-primary/60" />
        <blockquote className="relative mt-6 text-pretty text-xl font-medium leading-relaxed tracking-tight sm:text-2xl">
          We cut our performance review cycle from four months to forty-five
          days, and payroll stopped being a week-long scramble. The team finally
          trusts the numbers in front of them.
        </blockquote>
        {/* PLACEHOLDER: replace with a real, approved customer quote and name. */}
        <figcaption className="mt-8 flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary ring-1 ring-inset ring-primary/25">
            —
          </span>
          <span className="text-sm">
            <span className="block font-medium">Customer name</span>
            <span className="block text-muted-foreground">
              Head of People · Company
            </span>
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
