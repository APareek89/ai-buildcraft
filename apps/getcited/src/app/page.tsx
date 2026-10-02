import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import {
  SITE_URL,
  PAGE_TITLE,
  PAGE_DESCRIPTION,
  OG_TITLE,
  OG_DESCRIPTION,
  FAQS,
} from "@/components/landing/landing-data";
import { Hero } from "@/components/landing/hero";
import { WhyVisibility } from "@/components/landing/why-visibility";
import { Acts } from "@/components/landing/acts";
import { McpSection } from "@/components/landing/mcp-section";
import { Methodology, KeyCustody } from "@/components/landing/trust";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCta } from "@/components/landing/final-cta";
import { StickyCta } from "@/components/landing/sticky-cta";

/**
 * canonical and og:url are rendered as literal tags inside <Home /> (React 19
 * hoists them into <head>) because the Metadata API normalizes a root URL to
 * its origin, dropping the trailing slash — and we want the exact same
 * `${SITE_URL}/` form in canonical, og:url, and the JSON-LD below.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    siteName: "GetCited",
    type: "website",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: ["/logo.png"],
  },
};

/**
 * Single JSON-LD @graph: Organization ↔ WebSite ↔ WebPage ↔ SoftwareApplication
 * + FAQPage. Deliberately sparse and truthful: no sameAs, no contactPoint, no
 * aggregateRating/review (none exist), and price 0 only — the free audit is the
 * only public price. FAQ answers are the exact strings rendered in the DOM.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "GetCited",
      url: `${SITE_URL}/`,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
      description:
        "GetCited is an AI visibility tool that measures how AI assistants cite and recommend brands, then produces a costed, trackable action plan.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "GetCited",
      url: `${SITE_URL}/`,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: `${SITE_URL}/`,
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#software` },
      mainEntity: { "@id": `${SITE_URL}/#software` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "GetCited",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "AI visibility / generative engine optimization software",
      operatingSystem: "Web",
      url: `${SITE_URL}/`,
      description: PAGE_DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free illustrative mock audit — no signup required",
      },
      featureList: [
        "Configured OpenAI model probe and optional provider panel",
        "AI share of voice, citation share and sentiment tracking",
        "Competitor benchmarking on identical queries",
        "Citation-source crawling and gap diagnosis",
        "Costed action plan with per-tactic WHAT/WHY/HOW/WHO and weekly timeline",
        "DOCX/PDF/Excel plan export",
        "Editable execution tracker with plain-language progress Q&A",
        "MCP connector for Claude — 9 tools, OAuth 2.1 + PKCE",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

const FOOTER_LINKS = [
  { href: "#faq", label: "What is generative engine optimization?" },
  { href: "#why-ai-visibility", label: "GEO vs SEO vs AEO explained" },
  { href: "#methodology", label: "How the GetCited panel methodology works" },
  { href: "/connector", label: "MCP connector setup" },
];

export default async function Home() {


  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hoisted to <head> by React 19 — see the metadata comment above. */}
      <link rel="canonical" href={`${SITE_URL}/`} />
      <meta property="og:url" content={`${SITE_URL}/`} />

      {/* 11 sections, in spec order */}
      <Hero />
      <WhyVisibility />
      <Acts />
      <McpSection />
      <Methodology />
      <KeyCustody />
      <FaqSection />
      <FinalCta />

      {/* Footer — honest links only: on-page anchors + the real connector page */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <Logo />
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {FOOTER_LINKS.map((l) =>
                l.href.startsWith("#") ? (
                  <a
                    key={l.label}
                    href={l.href}
                    className="underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    className="underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                ),
              )}
            </nav>
          </div>
          <div className="mt-8 flex flex-col justify-between gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground md:flex-row">
            <span>© {new Date().getFullYear()} GetCited</span>
            <span>Projections are modeled estimates, not guarantees.</span>
          </div>
        </div>
      </footer>

      <StickyCta />
    </div>
  );
}
