import type { ReactNode } from "react";
import { Gauge, Camera, Ghost } from "lucide-react";

const DIGIDAY_URL =
  "https://digiday.com/marketing/marketers-question-expensive-ai-visibility-tools-as-inconsistent-results-fuel-skepticism/";
const GRADIAL_URL = "https://www.gradial.com/blog/geo-tools-great-data-but-who-does-the-work/";

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}

const STAT_CARDS: { figure: string; claim: string; source: ReactNode }[] = [
  {
    figure: "~0",
    claim: "Correlation between Google rank and AI citations. Ranking first doesn't make you the answer.",
    source: "Source: Ahrefs; Grow&Convert",
  },
  {
    figure: "0.664 vs 0.218",
    claim:
      "Web mentions correlate with AI visibility roughly three times more strongly than backlinks, across a 75,000-brand study.",
    source: "Source: Ahrefs",
  },
  {
    figure: "20–40 hrs/mo",
    claim: "The execution work agencies report AI visibility dashboards leave unassigned.",
    source: (
      <>
        {"Source: "}
        <SourceLink href={DIGIDAY_URL}>Digiday</SourceLink>
        {" & "}
        <SourceLink href={GRADIAL_URL}>Gradial</SourceLink>
      </>
    ),
  },
];

const VOCAB_CARDS = [
  {
    acronym: "SEO",
    term: "Search engine optimization",
    success: "Success = rankings and clicks",
    definition:
      "The discipline you know: make pages that rank in blue links. Still essential — but Google position and AI citation are separate problems, and winning one doesn't win the other.",
  },
  {
    acronym: "AEO",
    term: "Answer engine optimization",
    success: "Success = being the direct answer",
    definition:
      "Structure content so answer engines can lift it verbatim — featured snippets, AI Overviews, answer boxes. Necessary plumbing, but visibility without attribution is a half-win.",
  },
  {
    acronym: "GEO",
    term: "Generative engine optimization",
    success: "Success = mentions and citations in AI answers",
    definition:
      "Become the brand generative AI systems trust, recommend, and cite when your buyers ask. This is what GetCited measures and plans for.",
  },
];

const CRITIQUE_BEATS: { icon: typeof Gauge; opacity: string; text: ReactNode }[] = [
  {
    icon: Gauge,
    opacity: "opacity-80",
    text: 'You get a score. "Your brand appears in 18% of AI answers." Interesting.',
  },
  {
    icon: Camera,
    opacity: "opacity-70",
    text: "You get a screenshot. It goes in Thursday's deck. Everyone nods.",
  },
  {
    icon: Ghost,
    opacity: "opacity-60",
    text: (
      <>
        {
          "Nothing ships. Next month, the same score. The dashboard became an expensive report — what one buyer, quoted in "
        }
        <SourceLink href={DIGIDAY_URL}>Digiday</SourceLink>
        {', called "just a benchmarker."'}
      </>
    ),
  },
];

export function WhyVisibility() {
  return (
    <section id="why-ai-visibility" className="mx-auto w-full max-w-7xl px-6 py-24">
      {/* Block A: definition + stats */}
      <div className="grid items-start gap-16 lg:grid-cols-2">
        <div>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
            {"AI search optimization is its own discipline now — and your Google rankings won't transfer"}
          </h2>
          <div className="glass mt-8 rounded-[20px] border-l-[3px] border-l-violet-500 p-6">
            <p className="font-semibold text-foreground">
              {
                "AI visibility is how often AI assistants — Claude, Perplexity's answer engine, and their peers — mention, cite, or recommend your brand when buyers ask real questions. It is measured with three metrics: AI share of voice, citation share, and sentiment."
              }
            </p>
          </div>
          <p className="mt-6 text-muted-foreground">
            {
              'A growing share of buying research now ends inside an AI answer instead of a page of blue links. When a buyer asks an assistant "what\'s the best tool for X," the assistant names three or four brands — and everyone else is invisible. There is no page two. There is no impression report. If you are not measuring the answers directly, you do not know whether you exist in them.'
            }
          </p>
          <p className="mt-4 text-muted-foreground">
            {
              "Here is the uncomfortable part: your Google rankings do not transfer. Independent studies from Ahrefs and Grow&Convert found near-zero correlation between a page's Google position and whether AI assistants cite it. Ranking #1 and being cited by AI are separate problems with separate playbooks — which is why AI search optimization is now its own discipline, not a line item inside your SEO retainer."
            }
          </p>
        </div>
        <div className="space-y-4">
          {STAT_CARDS.map((s) => (
            <div key={s.figure} className="glass rounded-[20px] p-6">
              <div className="text-aurora text-3xl font-semibold">{s.figure}</div>
              <p className="mt-2 text-sm text-foreground">{s.claim}</p>
              <p className="mt-2 text-xs text-muted-foreground">({s.source})</p>
            </div>
          ))}
        </div>
      </div>

      {/* Block B: vocabulary strip */}
      <div className="mt-24">
        <h3 className="text-center text-2xl font-semibold tracking-tight text-foreground">
          SEO ranks pages. AEO wins answers. GEO gets you cited.
        </h3>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {VOCAB_CARDS.map((c) => (
            <div key={c.acronym} className="glass rounded-[20px] p-6">
              <div className="text-aurora font-mono text-2xl font-semibold">{c.acronym}</div>
              <div className="mt-1 text-sm font-medium text-foreground">{c.term}</div>
              <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                {c.success}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{c.definition}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-muted-foreground">
          {
            'You\'ll also hear "LLM SEO," "LLM optimization," and "AI SEO" — in practice, near-synonyms for GEO: the work of earning visibility in AI-generated answers. And one disambiguation worth stating plainly: GEO here means generative engine optimization, not geographic SEO — a different problem entirely. New to all of this? '
          }
          <a href="#faq" className="underline underline-offset-4 hover:text-foreground">
            {"See the GEO questions we answer most →"}
          </a>
        </p>
      </div>

      {/* Block C: critique */}
      <div className="mt-24">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
          Every AI visibility platform sells you the mirror
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {CRITIQUE_BEATS.map(({ icon: Icon, opacity, text }, i) => (
            <div key={i} className={`glass rounded-[20px] p-6 ${opacity}`}>
              <Icon className="h-5 w-5 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Block D: pivot */}
      <div className="mt-20">
        <p className="mx-auto max-w-4xl text-center text-xl font-medium text-foreground lg:text-2xl">
          {"GetCited was built backwards from the plan. The four acts below exist to make one document real: "}
          <span className="text-aurora">a costed, owned, dated plan to get your brand cited</span>
          {" — and a tracker that holds it accountable."}
        </p>
        <div className="mt-12 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
      </div>
    </section>
  );
}
