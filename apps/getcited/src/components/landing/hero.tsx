import { Radar, ClipboardList, KeyRound, Sigma, ArrowDown } from "lucide-react";
import { MockAudit } from "@/components/landing/mock-audit";

const FACT_CHIPS = [
  { icon: Radar, text: "Recorded model answers and clearly labeled prepared examples" },
  { icon: ClipboardList, text: "Costed plans — per-tactic WHAT, WHY, HOW, WHO, and timeline" },
  { icon: KeyRound, text: "Your keys or ours — Tab-session BYO keys, cleared on sign out" },
  { icon: Sigma, text: "A confidence rating on every projection — no guaranteed-lift claims" },
];

export function Hero() {
  return (
    <section id="hero" className="relative mx-auto w-full max-w-7xl px-6 pb-16 pt-20 lg:pt-28">
      <div className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left: copy */}
        <div>
          <div className="glass mb-6 inline-flex items-center rounded-full px-4 py-1.5 text-xs uppercase tracking-widest text-muted-foreground">
            {"AI visibility workspace · Free illustrative mock audit"}
          </div>
          <h1 className="text-balance text-5xl font-semibold tracking-tight text-foreground lg:text-6xl">
            {"Measure your AI visibility. Get the plan that "}
            <span className="text-aurora">closes the gap</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            {
              "Compare brand mentions in model answers, then turn your findings into a costed plan and an execution tracker. The hosted default is OpenAI GPT-4o mini. Prepared examples are free and illustrative; ordinary model requests use your allowance. Projections show their assumptions and are never guarantees."
            }
          </p>
          <a
            href="#act-1"
            className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            See the four acts <ArrowDown className="h-4 w-4" />
          </a>
        </div>

        {/* Right: the live audit form (the product, not a screenshot) */}
        <div id="audit-form" className="lg:pl-4">
          <div className="mb-3 text-sm font-medium text-foreground">
            Explore an illustrative report
          </div>
          <MockAudit />
          <p className="mt-3 text-xs text-muted-foreground">
            {
              "Free · No signup · No credit card. Instant results run on a clearly-labeled sample panel, so you can judge the full report before telling us anything — not even your email."
            }
          </p>
        </div>
      </div>

      {/* Fact strip — replaces the fake-logo trust bar competitors use */}
      <div className="relative mt-14 flex flex-wrap gap-3">
        {FACT_CHIPS.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="glass flex items-center gap-2.5 rounded-full px-4 py-2 text-xs text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
            {text}
          </div>
        ))}
      </div>
    </section>
  );
}
