import type { ReactNode } from "react";
import {
  CheckCircle2,
  Check,
  X,
  TrendingUp,
  Wallet,
  Users,
  CalendarDays,
  FileText,
  ChevronDown,
} from "lucide-react";

/* ---------------------------------- shared ---------------------------------- */

function SampleChip() {
  return (
    <span className="glass rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      Sample data
    </span>
  );
}

function ActShell({
  id,
  node,
  eyebrow,
  heading,
  body,
  features,
  vignette,
  mirrored = false,
  extra,
}: {
  id: string;
  node: number;
  eyebrow: string;
  heading: ReactNode;
  body: string;
  features: { lead: string; text: string }[];
  vignette: ReactNode;
  mirrored?: boolean;
  extra?: ReactNode;
}) {
  const text = (
    <div className="lg:sticky lg:top-24">
      <div className="text-aurora font-mono text-sm uppercase tracking-widest">{eyebrow}</div>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
        {heading}
      </h2>
      <p className="mt-5 text-muted-foreground">{body}</p>
      <ul className="mt-6 space-y-4">
        {features.map((f) => (
          <li key={f.lead} className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{f.lead}</span> {f.text}
            </p>
          </li>
        ))}
      </ul>
      {extra}
    </div>
  );

  return (
    <div id={id} className="relative py-16 lg:min-h-[80vh]">
      {/* Progress rail node */}
      <div className="absolute -left-6 top-16 hidden xl:flex xl:flex-col xl:items-center">
        <div className="bg-aurora flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white shadow-none">
          {node}
        </div>
      </div>
      <div className="grid items-center gap-16 lg:grid-cols-2">
        {mirrored ? (
          <>
            <div className="order-2 lg:order-1">{vignette}</div>
            <div className="order-1 lg:order-2">{text}</div>
          </>
        ) : (
          <>
            {text}
            <div>{vignette}</div>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Act 1 ---------------------------------- */

const SOV_BARS = [
  { name: "Competitor A", pct: 41, you: false },
  { name: "Competitor B", pct: 27, you: false },
  { name: "You", pct: 18, you: true },
  { name: "Competitor C", pct: 14, you: false },
];

function Act1Vignette() {
  return (
    <div className="glass rounded-[20px] p-8">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-foreground">
          {"AI Share of Voice — benchmark run"}
        </div>
        <SampleChip />
      </div>
      <div className="glass mt-4 inline-flex overflow-hidden rounded-full text-xs">
        <span className="bg-secondary px-3 py-1.5 text-foreground">Mention share</span>
        <span className="px-3 py-1.5 text-muted-foreground">Citation share</span>
      </div>
      <div className="mt-5 space-y-3">
        {SOV_BARS.map((b) => (
          <div key={b.name}>
            <div className="mb-1 flex justify-between text-xs">
              <span className={b.you ? "font-medium text-foreground" : "text-muted-foreground"}>
                {b.name}
              </span>
              <span className={b.you ? "text-foreground" : "text-muted-foreground"}>{b.pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={b.you ? "bg-aurora h-full rounded-full" : "h-full rounded-full bg-secondary"}
                style={{ width: `${b.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {["All engines", "Claude", "Perplexity"].map((t, i) => (
          <span
            key={t}
            className={
              i === 0
                ? "bg-aurora rounded-full px-3 py-1 text-xs text-white"
                : "glass rounded-full px-3 py-1 text-xs text-muted-foreground"
            }
          >
            {t}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {["You: neutral–positive", "Competitor A: positive", "Competitor B: mixed"].map((s) => (
          <span key={s} className="glass rounded-full px-2.5 py-1 text-muted-foreground">
            {s}
          </span>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {"24 buyer-intent queries × 2 engines · single-run snapshot, reported as directional · methodology below"}
      </p>
    </div>
  );
}

/* --------------------------------- Act 2 ---------------------------------- */

const SIX_DRIVERS = [
  "Presence on pages AI already trusts — the review sites, comparison posts, and publications assistants repeatedly cite in your category.",
  'Third-party validation — independent "best of" lists, reviews, and community recommendations carry more weight than anything on your own domain.',
  "Original research and statistics — unique, citable numbers are the single strongest reason for an assistant to quote you by name.",
  "Structured, extractable content — direct answers, definitions, ordered lists, and schema markup a model can lift without guessing.",
  "Consistent entity information — the same name, description, and category everywhere, so models are confident about who you are.",
  "Crawlability — if AI crawlers can't fetch the page, it cannot be retrieved or cited, no matter how good it is.",
];

function Act2Vignette() {
  return (
    <div className="relative">
      {/* Back card peeking */}
      <div className="glass absolute inset-x-4 top-6 -rotate-2 scale-95 rounded-[20px] p-6 opacity-60">
        <div className="truncate font-mono text-sm text-cyan-300">
          reviewsite.example/best-geo-tools-2026
        </div>
      </div>
      {/* Front card */}
      <div className="glass relative rounded-[20px] p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="truncate font-mono text-sm text-cyan-300">
            besttools.example/ai-visibility-tools-compared
          </div>
          <SampleChip />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="glass rounded-full px-2.5 py-1 text-xs text-muted-foreground">
            Comparison listicle
          </span>
          <span className="text-xs text-muted-foreground">Cited in 7 of 24 Perplexity answers</span>
        </div>
        <div className="mt-4 divide-y divide-white/10 text-sm">
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Competitor A</span>
            <Check className="h-4 w-4 text-positive" />
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Competitor B</span>
            <Check className="h-4 w-4 text-positive" />
          </div>
          <div className="flex items-center justify-between py-2 text-rose-300">
            <span>You</span>
            <X className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-4 border-l-2 border-cyan-400 pl-3 text-sm text-muted-foreground">
          {
            "In this sample, 3 listicle pages drive most of the category's citations — and none of them mention you. That's the gap the plan will attack first."
          }
        </p>
      </div>
    </div>
  );
}

function SixDrivers() {
  return (
    <div className="mt-8">
      <div className="text-sm font-semibold text-foreground">
        The six citation drivers (the rubric your gap analysis grades against):
      </div>
      <ol className="mt-3 divide-y divide-white/10">
        {SIX_DRIVERS.map((d, i) => (
          <li key={i} className="flex gap-3 py-3">
            <span className="bg-aurora flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
              {i + 1}
            </span>
            <span className="text-sm text-muted-foreground">{d}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* --------------------------------- Act 3 ---------------------------------- */

function Act3Vignette() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 rounded-full bg-[#7C3AED]/15 blur-[100px]"
      />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Budget $6,000
          </span>
          <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Team 2 people
          </span>
          <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Timeline 8 weeks
          </span>
          <SampleChip />
        </div>
        <div className="glass mt-4 rounded-[20px] p-6">
          <div className="flex items-center gap-3">
            <span className="bg-aurora rounded-full px-3 py-1 text-xs text-white">Week 3</span>
            <span className="text-xs text-muted-foreground">Due Mar 24</span>
          </div>
          <dl className="mt-4 grid grid-cols-[64px_1fr] gap-x-4 gap-y-2">
            <dt className="font-mono text-xs uppercase text-muted-foreground">What</dt>
            <dd className="text-sm text-foreground">
              {"Pitch inclusion in the two comparison listicles most cited for your category's buying queries."}
            </dd>
            <dt className="font-mono text-xs uppercase text-muted-foreground">Why</dt>
            <dd className="text-sm text-foreground">
              {"Absent from the listicle pages driving the majority of sampled category citations (see Diagnose evidence #4, #7)."}
            </dd>
            <dt className="font-mono text-xs uppercase text-muted-foreground">How</dt>
            <dd className="text-sm text-foreground">
              {"Outreach to both page owners with a comparison-data one-pager; publish a supporting head-to-head page on your own domain."}
            </dd>
            <dt className="font-mono text-xs uppercase text-muted-foreground">Who</dt>
            <dd className="text-sm text-foreground">{"Content lead — approx. 4 hrs/week"}</dd>
          </dl>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
              {"Modeled lift +6–9 pts SoV · assumptions listed in plan"}
            </span>
            <div className="flex gap-2">
              {["Word", "PDF", "Excel"].map((f) => (
                <span
                  key={f}
                  className="glass inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <FileText className="h-3 w-3" /> {f}
                </span>
              ))}
            </div>
          </div>
        </div>
        {/* Second row peeking */}
        <div className="glass mt-3 h-10 overflow-hidden rounded-[20px] px-6 py-2.5 opacity-50">
          <span className="text-xs text-muted-foreground">
            Week 4 · Publish original benchmark statistics page …
          </span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Act 4 ---------------------------------- */

function Act4Vignette() {
  return (
    <div className="relative">
      <div className="glass rounded-[20px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-medium text-foreground">Pitch listicle inclusion</div>
          <SampleChip />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-muted-foreground">
            In progress <ChevronDown className="h-3 w-3" />
          </span>
          <span className="glass rounded-full px-2.5 py-1 text-muted-foreground">Due Mar 24</span>
        </div>
        <p className="mt-2 text-xs italic text-muted-foreground">
          {'"First reply received — sending comparison one-pager."'}
        </p>
      </div>
      <div className="glass mt-3 rounded-[20px] p-5 opacity-70">
        <div className="text-sm font-medium text-foreground">
          Publish head-to-head comparison page
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-cyan-400">
            Done <Check className="h-3 w-3" />
          </span>
          <span className="glass rounded-full px-2.5 py-1 text-muted-foreground">Due Mar 10</span>
        </div>
      </div>
      <div className="mx-auto h-8 w-px bg-gradient-to-b from-violet-500/50 to-cyan-400/50" />
      <div className="space-y-3">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2 text-sm text-foreground">
          Are we on schedule?
        </div>
        <div className="glass max-w-[92%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-muted-foreground">
          <span className="glass mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide">
            Tracker status
          </span>
          <p>
            {
              "4 of 9 items on track, 1 at risk: the listicle pitch is due in 3 days and still awaiting a reply. Want me to draft the follow-up email, or re-run the benchmark to check for early movement? (Re-benchmarking is a paid run — I'll only do it if you say so.)"
            }
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- export ---------------------------------- */

export function Acts() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-7xl px-6 py-12">
      <ActShell
        id="act-1"
        node={1}
        eyebrow="ACT 1 — MEASURE"
        heading="Your AI share of voice, from a real multi-LLM panel. Not a simulated score."
        body={
          "GetCited asks the questions your buyers actually ask — using the configured OpenAI model by default, with other supported providers available on your keys. The panel records who gets mentioned, who gets cited as a linked source, and how each brand is described. And here's the honest part: one panel run is a snapshot, not a statistic — we say so on the report instead of pretending otherwise. What comes back is your AI share of voice: benchmarked against competitors, aggregated across the panel, labeled for exactly what it is."
        }
        features={[
          {
            lead: "Mention share vs citation share.",
            text: 'Being named is not being sourced. We report both, separately — because "the model knows you exist" and "the model sends buyers your way" are different problems.',
          },
          {
            lead: "Sentiment, across the panel.",
            text: 'It\'s not just whether you appear — it\'s whether you\'re "the affordable option" or "the category leader." We track how AI describes you.',
          },
          {
            lead: "Buyer-intent queries, not vanity prompts.",
            text: 'The panel runs the commercial questions — "best X for Y," "X vs Z," "is X worth it" — where citations decide revenue.',
          },
          {
            lead: "Directional by design.",
            text: 'A single-run panel is an observation, not a distribution. We report it as directional — never dressed up as a statistic — so you know exactly how much weight it can bear.',
          },
        ]}
        vignette={<Act1Vignette />}
      />

      <ActShell
        id="act-2"
        node={2}
        mirrored
        eyebrow="ACT 2 — DIAGNOSE"
        heading="AI citation tracking with receipts: we crawl the pages AI actually cites."
        body={
          "Knowing your score is 18% tells you nothing about why. So when the panel sees an engine cite a source, GetCited fetches that page — respecting robots.txt and rate limits — reads it, and categorizes it: comparison listicle, documentation, third-party review, community thread, original research. Then it maps which citation categories your competitors own and you don't. Every gap in your diagnosis links to a real page a real engine actually cited, not a black-box relevance score. You can click the evidence. That's the standard diagnosis should meet."
        }
        features={[
          {
            lead: "Evidence, not vibes.",
            text: "Each finding cites the crawled page behind it — URL, category, and how many answers it appeared in.",
          },
          {
            lead: "Category gap analysis.",
            text: '"You\'re absent from comparison listicles" is actionable. "Your score is low" is not.',
          },
          {
            lead: "Competitor presence mapping.",
            text: "See exactly which cited pages name your competitors and skip you — those are your highest-leverage targets.",
          },
          {
            lead: "Respectful crawling.",
            text: "robots.txt honored, rate-limited, no scraping arms race. The diagnosis is built to be defensible.",
          },
        ]}
        vignette={<Act2Vignette />}
        extra={<SixDrivers />}
      />

      <ActShell
        id="act-3"
        node={3}
        eyebrow="ACT 3 — PLAN"
        heading="Tell us your budget, team, and deadline. Get a plan with names and dates on it."
        body={
          "This is the part every other tool skips. Give GetCited three constraints — budget, who's available, and when you need movement — and its allocator selects the tactics that close your biggest citation gaps per dollar, in order, until the budget is spent. Not a generic checklist: a committed roadmap where every action ships as WHAT, WHY, HOW, and WHO, scheduled to a week, grounded in the crawled evidence from Act 2. Export it and walk into Monday's meeting with the document this category has been refusing to write."
        }
        features={[
          {
            lead: "Costed, not aspirational.",
            text: "Every tactic carries an effort estimate, and the plan totals against your actual budget — you see what's in, what's out, and why.",
          },
          {
            lead: "WHAT / WHY / HOW / WHO / when.",
            text: "Each row is assignable on sight. The WHY always cites the diagnosis evidence behind it.",
          },
          {
            lead: "A projection that shows its work.",
            text: "The plan states its modeled share-of-voice lift with its full assumption list and a confidence rating — low, medium, or high — attached. It is an estimate. It says so, on the document.",
          },
          {
            lead: "One-click export.",
            text: "DOCX for your boss, PDF for the deck, Excel for the ops tracker — because plans that live only inside a SaaS tab don't get executed.",
          },
        ]}
        vignette={<Act3Vignette />}
      />

      <ActShell
        id="act-4"
        node={4}
        mirrored
        eyebrow="ACT 4 — TRACK"
        heading="Approve the plan and it becomes a tracker. Then just ask how it's going."
        body={
          'Say yes to the plan and GetCited turns it into a living tracker — one editable execution item per action, due dates derived from the schedule you approved. Update statuses, drop remarks, reassign. Then close the loop the way this category never does: ask, in plain language, "how are we progressing?" — and get an answer computed from your tracker\'s actual state, not from a fresh benchmark. Re-running the panel costs real money, so GetCited only re-benchmarks when you explicitly ask it to. Your tracker is the source of truth between measurements. That\'s the difference between a monitoring tool and an operating system for getting cited.'
        }
        features={[
          {
            lead: "One item per action, editable inline.",
            text: "Status, remarks, dates — it's your tracker, not a read-only report.",
          },
          {
            lead: "Progress answers from your data.",
            text: '"Are we on schedule?" is answered from item statuses and due dates — instant, free, honest.',
          },
          {
            lead: "Re-benchmark on request only.",
            text: "Measurement costs money; we never burn your budget silently to decorate a chart.",
          },
          {
            lead: "The loop actually closes.",
            text: "Measure → Diagnose → Plan → Track → measure again — each cycle starts from evidence of what you actually shipped.",
          },
        ]}
        vignette={<Act4Vignette />}
      />

      {/* Pull-quote closing the four acts */}
      <p className="mx-auto max-w-4xl py-16 text-center text-2xl font-medium text-foreground lg:text-3xl">
        {"Every other tool sells you "}
        <span className="text-aurora">the mirror</span>
        {". GetCited sells the mirror, "}
        <span className="text-aurora">the itemized repair bill</span>
        {", and "}
        <span className="text-aurora">the repair tracking</span>.
      </p>
    </section>
  );
}
