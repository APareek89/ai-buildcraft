import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { LogoMark } from "@/components/logo";

export function FinalCta() {
  return (
    <section id="final-cta" className="relative mx-auto w-full max-w-4xl px-6 py-32">
      {/* Converging aurora radials — the page's largest glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-1/3 h-[360px] w-[360px] rounded-full bg-[#7C3AED]/30 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-1/3 h-[360px] w-[360px] rounded-full bg-[#22D3EE]/25 blur-[130px]"
      />

      <div className="glass relative mx-auto max-w-2xl rounded-[28px] p-12 text-center">
        <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">
          {"Sixty seconds from now, you'll "}
          <span className="text-aurora">know if AI cites you</span>.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
          {
            "The audit is free, instant, and asks for nothing — not even an email. If the report isn't useful, close the tab; you've lost a minute. If it is, you'll have your gap list — and we'll have earned the next conversation."
          }
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#audit-form"
            className="bg-aurora inline-flex items-center rounded-full px-10 py-4 text-lg font-medium text-white transition-opacity hover:opacity-90"
          >
            Run my free audit
          </a>
          <ButtonLink
            href="/connector"
            className="glass rounded-full border-0 bg-transparent px-6 py-4 text-foreground hover:bg-secondary"
          >
            <LogoMark className="h-4 w-4" /> Add GetCited to Claude
          </ButtonLink>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {["Free", "No signup", "No credit card", "Modeled estimates, never guarantees"].map(
            (m) => (
              <span key={m} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-positive" /> {m}
              </span>
            ),
          )}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          {
            "The instant audit runs on clearly-labeled sample data — it exists so you can judge the product before trusting it with a real run. We'd rather show you an honest demo than a rigged live number. Real panels start when you connect a brand — on our keys, or yours."
          }
        </p>
      </div>
    </section>
  );
}
