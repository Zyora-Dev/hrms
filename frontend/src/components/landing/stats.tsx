const STATS = [
  { value: "50K+", label: "Businesses running HR with us" },
  { value: "1M+", label: "Employees managed on the platform" },
  { value: "165+", label: "Countries supported" },
  { value: "99.9%", label: "Uptime across the last 12 months" },
];

export function Stats() {
  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden px-6 py-12 sm:py-14 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="px-4 text-center">
            <p className="bg-gradient-to-b from-foreground to-foreground/55 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
              {s.value}
            </p>
            <p className="mx-auto mt-2 max-w-[12rem] text-xs leading-relaxed text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
