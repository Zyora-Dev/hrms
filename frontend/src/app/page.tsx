import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { Stats } from "@/components/landing/stats";
import { Features, Automations } from "@/components/landing/features";
import { Testimonial } from "@/components/landing/testimonial";
import { Faq } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";

export default function Home() {
  return (
    // The marketing site keeps the dark palette; the admin area is light.
    <div className="dark flex flex-1 flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Stats />
        <Features />
        <Automations />
        <Testimonial />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
