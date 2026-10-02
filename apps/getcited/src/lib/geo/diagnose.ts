import "server-only";
import type { FullReport } from "./report";
import {
  categorizeSource,
  computeGap,
  emptyProfile,
  type CitationProfile,
  type Gap,
} from "./plan";
import { computeCitations, type AnalysisAnswer } from "./analysis";
import { crawlCitations, type CrawlResult } from "./crawl";
import type { SourceType } from "./tactics";

export interface Diagnosis {
  currentCitationShare: number;
  yourProfile: CitationProfile;
  categoryProfile: CitationProfile;
  gap: Gap[];
  topDomains: { domain: string; count: number; is_yours: boolean; sourceType: SourceType }[];
  crawled?: CrawlResult[];
  crawlGrounded: boolean;
}

/**
 * Derive source-type profiles + gap from a stored benchmark report. The "category"
 * profile is where AI currently cites in this space; "your" profile is your owned
 * citations. The gap (category − you) is what the plan is built to close. Deterministic
 * and cheap — no crawl needed unless `crawl: true` is passed (to raise confidence).
 */
export async function diagnoseFromReport(
  report: FullReport,
  opts: { brand: string; ownedDomains: string[]; crawl?: boolean; maxCrawl?: number },
): Promise<Diagnosis> {
  const analysisAnswers: AnalysisAnswer[] = report.answers.map((a) => ({
    prompt: a.prompt,
    rawAnswer: "",
    citedDomains: a.cited_domains,
    sentiment: a.sentiment,
  }));
  const citations = computeCitations(opts.brand, analysisAnswers, opts.ownedDomains);

  const yourProfile = emptyProfile();
  const categoryProfile = emptyProfile();
  const topDomains = citations.by_domain.map((d) => {
    const sourceType = categorizeSource(`https://${d.domain}`, { ownedDomains: opts.ownedDomains });
    categoryProfile[sourceType] += d.count;
    if (d.is_yours) yourProfile[sourceType] += d.count;
    return { domain: d.domain, count: d.count, is_yours: d.is_yours, sourceType };
  });

  const gap = computeGap(yourProfile, categoryProfile);

  let crawled: CrawlResult[] | undefined;
  let crawlGrounded = false;
  if (opts.crawl) {
    const urls = citations.by_domain
      .filter((d) => !d.is_yours)
      .slice(0, opts.maxCrawl ?? 12)
      .map((d) => `https://${d.domain}`);
    crawled = await crawlCitations(urls, {
      ownedDomains: opts.ownedDomains,
      brandNames: [opts.brand],
      maxUrls: opts.maxCrawl ?? 12,
    });
    crawlGrounded = crawled.some((c) => c.fetched);
  }

  return {
    currentCitationShare: citations.your_citation_share,
    yourProfile,
    categoryProfile,
    gap,
    topDomains,
    crawled,
    crawlGrounded,
  };
}
