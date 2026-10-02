/**
 * Shared landing-page data. The FAQ array is the single source of truth for
 * both the visible FAQ section and the FAQPage JSON-LD, guaranteeing the
 * verbatim DOM parity Google requires.
 */

export const SITE_URL = "https://getcited.localhost";

export const PAGE_TITLE = "AI Visibility Tool — Get Your Brand Cited by AI | GetCited";

export const PAGE_DESCRIPTION =
  "Compare model answers about your brand, inspect a costed plan, and track execution. Free illustrative mock audit; saved prepared example after signup.";

export const OG_TITLE = "GetCited — The AI Visibility Tool That Ends in a Plan, Not a Report";

export const OG_DESCRIPTION =
  "Explore prepared examples or run a configured OpenAI probe. Directional mention share, modeled plans, and an explicit execution tracker.";

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "What is AI visibility and how is it measured?",
    a: "AI visibility is how often AI assistants — Claude, Perplexity's answer engine, and their peers — mention, cite, or recommend your brand when buyers ask real questions in your category. It's measured by running those buyer-intent questions across a panel of engines and recording three things: share of voice (how often you appear vs competitors), citation share (how often your pages are linked as sources), and sentiment (how you're described). GetCited provides labeled prepared examples and ordinary configured-model runs — and because one panel run is a snapshot, not a statistic, the report says so plainly instead of dressing the numbers up.",
  },
  {
    q: "What is generative engine optimization (GEO)?",
    a: "Generative engine optimization (GEO) is the practice of improving how generative AI systems represent, recommend, and cite your brand in their answers. Where SEO earns rankings in blue links, GEO earns mentions and citations inside AI-generated answers — a different surface with different rules. Answer engine optimization (AEO) and LLM SEO are near-synonyms; whatever you call it, the success metric is citations in AI answers, and that's the number GetCited measures and plans against.",
  },
  {
    q: "How is GEO different from SEO and AEO?",
    a: "SEO gets your pages ranked in search results; AEO gets your content lifted as the direct answer in snippets and AI Overviews; GEO gets your brand trusted and cited by generative AI systems like Claude and Perplexity. The tactics overlap — structured content, third-party validation, entity consistency — but the success metrics differ: clicks for SEO, answer placements for AEO, citations for GEO. Winning one does not automatically win the others, which is why AI answers have to be measured directly.",
  },
  {
    q: "How do I get my brand mentioned by AI assistants?",
    a: "There's no pay-to-play: AI assistants mention brands based on training-data associations and live retrieval of pages they trust. In practice the drivers are presence on third-party 'best of' lists and review sites, original research worth citing, well-structured extractable content, and consistent brand information across the web. GetCited's Diagnose step crawls the pages AI engines actually cite in your category and shows exactly which of those pages skip you — then the Plan step turns each gap into a costed, assigned tactic.",
  },
  {
    q: "How do AI assistants decide which sources to cite?",
    a: "Two mechanisms: brand associations learned in training data, and live retrieval of crawlable, well-structured pages that reflect web consensus. Notably, Ahrefs' study of 75,000 brands found web mentions correlate with AI visibility far more strongly than backlinks (0.664 vs 0.218) — the currency of AI citation is being talked about on pages engines trust. The mix also differs by engine, which is why GetCited runs a multi-engine panel instead of extrapolating from one.",
  },
  {
    q: "Does ranking #1 on Google mean AI will cite me?",
    a: "No. Independent studies by Ahrefs and Grow&Convert both found near-zero correlation between Google rankings and citations in AI answers — the two systems select sources in fundamentally different ways. You can dominate page one and be invisible in AI answers, which is why treating AI visibility as a side effect of SEO is the most common measurement mistake in this category. You have to measure AI answers directly, which is exactly what GetCited's panel does.",
  },
  {
    q: "How do I track my brand mentions across Claude and Perplexity?",
    a: "Run the same buyer-intent questions across each engine, record every mention, citation, and sentiment signal, and benchmark the results against your competitors over time. Doing this manually is possible but slow. GetCited automates it as a multi-LLM panel — OpenAI by default, with other supported providers available on configured keys — and reports AI share of voice and citation share aggregated across the panel. One run is a snapshot, not a statistic, and the report says so instead of pretending otherwise.",
  },
  {
    q: "What is AI share of voice?",
    a: "GetCited computes AI share of voice as a brand’s answer mentions divided by total mentions across the tracked brands. GetCited splits it into two metrics because they answer different questions: mention share (how often you're named at all) and citation share (how often your pages are linked as sources — the stronger signal, since it sends buyers to you). Both are aggregated across the panel and benchmarked against the competitors you configure.",
  },
  {
    q: "How long does it take to improve AI visibility?",
    a: "Honest ranges from published practitioner data: technical and crawlability fixes can register in about two weeks, first new citations typically appear in four to six weeks, and durable share-of-voice movement usually takes two to three months — varying by engine refresh cycles and how contested your category is. Anyone promising faster guaranteed results is ignoring how these systems actually update. GetCited's plan attaches a timeline to every tactic, and the Tracker answers 'are we on schedule?' from your actual execution status.",
  },
  {
    q: "Why do AI answers change every time I ask?",
    a: "Large language models are non-deterministic: the same question can produce different answers depending on the run, phrasing, geography, and model version. That's why a screenshot of one good answer is an anecdote, not a measurement — and why your manual spot-check rarely matches a tool's report. GetCited's panels are single-run today, and the report labels them exactly that way — a directional snapshot, never dressed up as a statistic — so you always know precisely how much weight the numbers can bear.",
  },
  {
    q: "Can GetCited guarantee my brand gets cited by AI?",
    a: "No — and you should be suspicious of any vendor who says yes, because these systems answer differently on every run and no one controls their outputs. Every projection GetCited produces is a modeled estimate with its assumptions stated and a confidence rating — low, medium, or high — attached. What we do commit to is verifiable: ordinary measurements record actual configured-model responses, the plan is costed against your actual budget and team, and the tracker shows progress you can audit line by line.",
  },
  {
    q: "Do I need my own API keys, and what happens to my data?",
    a: "You choose between two modes. We Serve runs the panel on GetCited's own keys and infrastructure — zero setup, transparently metered. Self Serve lets you bring your own provider keys, which are held in this tab’s session storage by default and cleared on sign out or account change (browsers may restore tab storage); if you prefer convenience, you can opt in to AES-GCM encrypted storage and remove your keys at any time. Key values are never logged and never displayed back — the app only ever checks that a key is present.",
  },
];
