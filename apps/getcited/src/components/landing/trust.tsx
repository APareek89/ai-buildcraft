import { Check, Server, KeyRound, Lock } from "lucide-react";

/* ------------------------- Methodology / honesty ------------------------- */

const COMMITMENT_CARDS = [
  {
    title: "Know what was measured.",
    text: "Prepared examples are illustrative and free. Ordinary probes record an actual configured-model response; a single response is directional, not market research.",
  },
  {
    title: "The plan is costed.",
    text: "Tactics selected against your actual budget, each with WHAT/WHY/HOW/WHO and a date. The projection states its assumptions on the exported document itself.",
  },
  {
    title: "The progress is verifiable.",
    text: "The tracker answers from your own execution data. When we re-measure, you see movement against the same disclosed methodology — run to run, not screenshot to screenshot.",
  },
];

const SPEC_SHEET = [
  ["queries", "Buyer-intent questions for your category; you see the full list before any run."],
  ["runs", "Single-run panels by default — reported as directional, never dressed up as statistics."],
  ["engines", "Hosted default: OpenAI GPT-4o mini. Other explicitly supported providers require configured keys."],
  [
    "scoring",
    "Share of voice = a brand’s answer mentions / total mentions across tracked brands. Ungrounded domain mentions are unverified; projections are modeled estimates.",
  ],
  [
    "confidence",
    "Every projection carries a confidence rating (low/medium/high) and its full assumption list.",
  ],
  ["crawling", "robots.txt respected, rate-limited, evidence pages linked in your diagnosis."],
];

const PRACTICED_ITEMS = [
  "Every key concept — AI visibility, GEO, AEO, share of voice, citation share — is defined in a single extractable sentence an assistant can quote without editing.",
  "Every statistic is real and attributed: Ahrefs' 75,000-brand mention study, the Ahrefs and Grow&Convert rank-correlation findings, industry reporting on tool skepticism. No invented numbers, no fabricated testimonials, no fake logos, anywhere.",
  "The FAQ below ships as FAQPage structured data alongside Organization, SoftwareApplication, WebSite, and WebPage JSON-LD — machine readability, practiced on the page that preaches it.",
];

export function Methodology() {
  return (
    <section id="methodology" className="mx-auto w-full max-w-7xl px-6 py-28">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
          Published methodology. Estimates with stated confidence. Never guarantees.
        </h2>
        <p className="mt-6 text-muted-foreground">
          {
            "You will find vendors in this category promising multiplied share of voice in 60 days. Be suspicious: these systems answer differently every single run — anyone quoting a guaranteed lift from a non-deterministic system is selling you the variance. The sharpest criticism of AI visibility tools is that they hide their methods — undisclosed prompt lists, unknown run counts, opaque scoring — and then headline guaranteed lifts. GetCited was built as the rebuttal. Every projection is a modeled estimate with its assumptions stated and a confidence rating attached. Every panel run is labeled for what it is — a single-run snapshot, reported as directional. And the methodology behind your numbers is disclosed, not hidden — because a measurement you can't interrogate is a measurement you can't trust."
          }
        </p>
      </div>

      {/* Never-say / will-say card */}
      <div className="mx-auto mt-12 max-w-3xl">
        <div className="glass overflow-hidden rounded-[20px]">
          <div className="border-l-2 border-l-rose-400 bg-[rgba(244,63,94,0.06)] p-6">
            <div className="text-xs font-medium uppercase tracking-wide text-rose-300">
              {"What we'll never say"}
            </div>
            <p className="mt-2 text-foreground">{'"Guaranteed 6× share of voice in 60 days."'}</p>
          </div>
          <div className="border-l-2 border-l-cyan-400 bg-[rgba(34,211,238,0.06)] p-6">
            <div className="text-xs font-medium uppercase tracking-wide text-cyan-300">
              What we will say
            </div>
            <p className="mt-2 text-foreground">
              {
                '"This plan models a 4–9 point share-of-voice lift over ten weeks, assuming the three comparison-page placements land and your docs become crawlable. Here\'s the confidence rating. Here\'s the tracker."'
              }
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {
            "The second sentence is example phrasing — your plan's numbers come from your panel, your gaps, and your budget."
          }
        </p>
      </div>

      {/* Commitment cards */}
      <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
        {COMMITMENT_CARDS.map((c) => (
          <div key={c.title} className="glass relative overflow-hidden rounded-[20px] p-6">
            <div className="bg-aurora absolute inset-x-0 top-0 h-0.5" />
            <div className="font-semibold text-foreground">{c.title}</div>
            <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
          </div>
        ))}
      </div>

      {/* Methodology spec sheet */}
      <div className="mx-auto mt-12 max-w-2xl divide-y divide-white/10">
        {SPEC_SHEET.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-4 py-4">
            <div className="font-mono text-sm text-aurora">{label}</div>
            <div className="text-sm text-muted-foreground">{value}</div>
          </div>
        ))}
      </div>

      {/* Practiced on ourselves */}
      <div className="mx-auto mt-14 max-w-3xl rounded-[21px] bg-gradient-to-r from-violet-500/60 to-cyan-400/60 p-px">
        <div className="rounded-[20px] bg-[#0A0F1C] p-8">
          <p className="text-foreground">
            {
              "A GEO tool whose own homepage can't get cited would be a bad joke. So this page is generative engine optimization, practiced on ourselves:"
            }
          </p>
          <ul className="mt-5 space-y-3">
            {PRACTICED_ITEMS.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-aurora mt-6 font-medium">
            {
              "Ask your favorite assistant what AI share of voice is. If it answers in our words, you'll know this section worked."
            }
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Key custody ------------------------------ */

export function KeyCustody() {
  return (
    <section id="key-custody" className="mx-auto w-full max-w-4xl px-6 py-24">
      <h2 className="text-balance text-center text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
        Whose API keys run your panel? You decide.
      </h2>
      <p className="mx-auto mt-5 max-w-2xl text-center text-muted-foreground">
        {
          "Every AI visibility tool burns LLM calls on your behalf. Almost none of them tell you whose keys, where your data goes, or what's retained. We think that's a question a measurement company should answer on its homepage — so here's ours, in full."
        }
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="glass relative overflow-hidden rounded-[20px] p-7">
          <div className="bg-aurora absolute inset-x-0 top-0 h-0.5" />
          <Server className="h-6 w-6 text-primary" />
          <h3 className="mt-4 text-xl font-semibold text-foreground">We Serve</h3>
          <p className="text-aurora mt-1 text-sm font-medium">
            Zero setup. Our keys, our infrastructure.
          </p>
          <ul className="mt-5 space-y-3">
            {[
              "Start measuring immediately — no provider accounts, no key management.",
              "Panel costs are metered transparently — every run reports its exact cost, and a hard per-run cost ceiling is enforced.",
              "Best for teams who want answers this week, not an integration project.",
            ].map((f) => (
              <li key={f} className="flex gap-2.5 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" /> {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass rounded-[20px] p-7">
          <KeyRound className="h-6 w-6 text-primary" />
          <h3 className="mt-4 text-xl font-semibold text-foreground">Self Serve</h3>
          <p className="text-aurora mt-1 text-sm font-medium">
            Bring your own keys. They stay yours.
          </p>
          <ul className="mt-5 space-y-3">
            {[
              "Your provider keys are held in this tab’s session storage by default — gone when your session ends.",
              "Prefer convenience? Opt in to encrypted storage: AES-GCM, encrypted at rest, removable any time.",
              "Key values are never logged and never displayed back; the app only ever checks that a key is present.",
            ].map((f) => (
              <li key={f} className="flex gap-2.5 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" /> {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-8 flex items-start justify-center gap-2 text-center text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {
            "Same product, same methodology, either mode — custody is a setting, not a plan tier. Your workspace data is row-level-secured to your account, and everything the plan produces exports with one click."
          }
        </span>
      </p>
    </section>
  );
}
