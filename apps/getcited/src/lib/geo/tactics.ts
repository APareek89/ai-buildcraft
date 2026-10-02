/**
 * The tunable tactic library (build spec §4 Step 3). Each tactic carries cost (USD),
 * effort (person-hours), lead time (weeks), and an evidence-weighted citation-lift
 * toward specific source types. These are DEFAULTS — meant to be tuned. All numbers
 * are ranges; the allocator uses the midpoint.
 */

export type SourceType =
  | "roundup"
  | "review"
  | "editorial"
  | "youtube"
  | "reddit"
  | "owned"
  | "social"
  | "other";

export const SOURCE_TYPES: SourceType[] = [
  "roundup",
  "review",
  "editorial",
  "youtube",
  "reddit",
  "owned",
  "social",
  "other",
];

export interface Tactic {
  id: string;
  name: string;
  costUsd: [number, number];
  effortHours: [number, number];
  leadWeeks: [number, number];
  /** Citation-lift points toward each source type (higher = stronger). */
  lifts: Partial<Record<SourceType, number>>;
  /** Foundational tactics multiply the effect of everything else (schema/llms.txt). */
  foundationalMultiplier?: number;
  description: string;
}

export const TACTIC_LIBRARY: Tactic[] = [
  {
    id: "sponsored_post",
    name: "Sponsored / guest post on a niche blog",
    costUsd: [150, 400],
    effortHours: [4, 8],
    leadWeeks: [2, 4],
    lifts: { editorial: 4 },
    description: "Placed article on a relevant industry blog that AI answers tend to cite.",
  },
  {
    id: "roundup",
    name: 'Get into a "best X" roundup (outreach ± paid)',
    costUsd: [0, 500],
    effortHours: [6, 12],
    leadWeeks: [3, 8],
    lifts: { roundup: 8 },
    description: "Land in listicles/roundups — the format AI assistants quote most for recommendations.",
  },
  {
    id: "review_profiles",
    name: "G2 / Capterra / ProductHunt profile + seed reviews",
    costUsd: [0, 0],
    effortHours: [10, 20],
    leadWeeks: [2, 6],
    lifts: { review: 7 },
    description: "Claim review-platform profiles and seed genuine reviews (high impact for B2B).",
  },
  {
    id: "youtube_mention",
    name: "Sponsor a YouTube review / mention",
    costUsd: [200, 1000],
    effortHours: [3, 6],
    leadWeeks: [2, 4],
    lifts: { youtube: 5 },
    description: "A creator review/mention that surfaces in video-aware AI answers.",
  },
  {
    id: "comparison_pages",
    name: 'Publish "X vs Y" comparison pages (per 3)',
    costUsd: [0, 0],
    effortHours: [12, 24],
    leadWeeks: [1, 3],
    lifts: { owned: 7 },
    description: "Owned comparison pages that answer buyer-intent queries directly.",
  },
  {
    id: "reddit_answers",
    name: "10–15 genuine Reddit / community answers",
    costUsd: [0, 0],
    effortHours: [8, 15],
    leadWeeks: [1, 4],
    lifts: { reddit: 4 },
    description: "Helpful, non-spammy answers in communities AI assistants cite.",
  },
  {
    id: "digital_pr",
    name: "Digital PR / HARO responses",
    costUsd: [0, 300],
    effortHours: [6, 12],
    leadWeeks: [3, 8],
    lifts: { editorial: 3 },
    description: "Earned news/editorial mentions via journalist requests.",
  },
  {
    id: "schema_llmstxt",
    name: "FAQ + Product schema + llms.txt on your pages",
    costUsd: [0, 0],
    effortHours: [4, 8],
    leadWeeks: [1, 1],
    lifts: { owned: 2 },
    foundationalMultiplier: 1.15,
    description: "Foundational: makes your pages easier for AI to parse and cite — multiplies everything else.",
  },
];

export function mid(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}
