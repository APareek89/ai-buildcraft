import { TACTIC_LIBRARY, mid, SOURCE_TYPES, type SourceType, type Tactic } from "./tactics";

/**
 * The budget → plan scoring engine (build spec §4). Transparent + tunable:
 *  1. categorizeSource — classify a cited URL into a source type.
 *  2. buildCitationProfile — count citations per source type (per competitor).
 *  3. computeGap — your profile vs the leader's → biggest deficits.
 *  4. allocatePlan — capacity-aware greedy knapsack, gap-first.
 *  5. projectImpact — modeled projection (NEVER a guarantee): assumptions + confidence.
 */

// ── Tunable constants (all surfaced as assumptions) ──────────────────────────
export const PRODUCTIVE_HOURS_PER_WEEK = 25;
export const LIFT_TO_SHARE = 0.005; // citation-share points gained per lift point
export const MAX_SHARE_GAIN = 0.25; // cap on modeled share gain from one plan
export const SHARE_CAP = 0.6; // no plan projects past 60% citation share
const GAP_BOOST = 2; // how much a large deficit boosts a matching tactic

export const DEFAULT_ASSUMPTIONS = {
  categorySearchVolume: 10_000, // monthly searches in the category
  aiQueryFraction: 0.2, // share of those queries that happen via AI assistants
  citationClickRate: 0.3, // click-through when you're cited in an AI answer
  conversionRate: 0.02, // visit → conversion
};

// ── Step 1: categorize a source ──────────────────────────────────────────────
const REVIEW_HOSTS = ["g2.com", "capterra.com", "producthunt.com", "trustpilot.com", "getapp.com", "softwareadvice.com", "trustradius.com"];
const SOCIAL_HOSTS = ["twitter.com", "x.com", "linkedin.com", "facebook.com", "instagram.com", "tiktok.com"];
const EDITORIAL_HOSTS = ["techcrunch.com", "forbes.com", "theverge.com", "wired.com", "businessinsider.com", "mashable.com", "venturebeat.com", "zdnet.com"];
const ROUNDUP_HINTS = ["best-", "best ", "top-", "top ", "-vs-", " vs ", "alternatives", "roundup", "comparison"];

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function categorizeSource(
  url: string,
  opts?: { title?: string; ownedDomains?: string[] },
): SourceType {
  const host = hostOf(url);
  const owned = (opts?.ownedDomains ?? []).map((d) => d.toLowerCase().replace(/^www\./, ""));
  if (owned.some((o) => host === o || host.endsWith(`.${o}`))) return "owned";

  if (host.includes("reddit.com")) return "reddit";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (REVIEW_HOSTS.some((h) => host.includes(h))) return "review";
  if (SOCIAL_HOSTS.some((h) => host.includes(h))) return "social";

  const hay = `${url} ${opts?.title ?? ""}`.toLowerCase();
  if (ROUNDUP_HINTS.some((k) => hay.includes(k))) return "roundup";
  if (EDITORIAL_HOSTS.some((h) => host.includes(h)) || /\/(news|press|blog)\//.test(hay)) return "editorial";
  return "other";
}

// ── Step 2: citation profile + gap ───────────────────────────────────────────
export type CitationProfile = Record<SourceType, number>;

export function emptyProfile(): CitationProfile {
  return Object.fromEntries(SOURCE_TYPES.map((t) => [t, 0])) as CitationProfile;
}

export function buildCitationProfile(entries: { sourceType: SourceType }[]): CitationProfile {
  const profile = emptyProfile();
  for (const e of entries) profile[e.sourceType] += 1;
  return profile;
}

export interface Gap {
  sourceType: SourceType;
  you: number;
  leader: number;
  deficit: number;
}

/** Your profile vs the leader's → positive deficits, biggest first. */
export function computeGap(you: CitationProfile, leader: CitationProfile): Gap[] {
  return SOURCE_TYPES.map((t) => ({ sourceType: t, you: you[t], leader: leader[t], deficit: Math.max(0, leader[t] - you[t]) }))
    .filter((g) => g.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);
}

// ── Step 3/4: allocation ─────────────────────────────────────────────────────
export interface AllocateInput {
  budgetUsd: number;
  teamSize: number;
  timelineWeeks: number;
  gaps?: Gap[];
  tactics?: Tactic[];
}

export interface ChosenTactic {
  id: string;
  name: string;
  costUsd: number;
  effortHours: number;
  leadWeeks: [number, number];
  totalLift: number;
  foundationalMultiplier: number;
  /** Which gap (source type) this tactic most helps close, if any. */
  closesGap: SourceType | null;
  description: string;
}

export interface AllocationResult {
  personHours: number;
  budgetUsd: number;
  tactics: ChosenTactic[];
  spentUsd: number;
  spentHours: number;
}

function totalLiftOf(t: Tactic): number {
  return Object.values(t.lifts).reduce((a, b) => a + (b ?? 0), 0);
}

function gapWeights(gaps: Gap[]): Partial<Record<SourceType, number>> {
  if (gaps.length === 0) return {};
  const maxDeficit = Math.max(...gaps.map((g) => g.deficit));
  const w: Partial<Record<SourceType, number>> = {};
  for (const g of gaps) w[g.sourceType] = 1 + (g.deficit / maxDeficit) * GAP_BOOST;
  return w;
}

/** Score used to ORDER tactics — lift weighted by how well it fills the biggest gaps. */
function priorityScore(t: Tactic, weights: Partial<Record<SourceType, number>>): number {
  let s = 0;
  for (const [type, lift] of Object.entries(t.lifts)) {
    s += (lift ?? 0) * (weights[type as SourceType] ?? 1);
  }
  // Foundational tactics amplify everything → give them a standing bonus.
  if (t.foundationalMultiplier) s *= t.foundationalMultiplier + 0.2;
  return s;
}

function closesGapFor(t: Tactic, gaps: Gap[]): SourceType | null {
  const gapTypes = new Set(gaps.map((g) => g.sourceType));
  let best: SourceType | null = null;
  let bestLift = 0;
  for (const [type, lift] of Object.entries(t.lifts)) {
    if (gapTypes.has(type as SourceType) && (lift ?? 0) > bestLift) {
      best = type as SourceType;
      bestLift = lift ?? 0;
    }
  }
  return best;
}

/**
 * Greedy knapsack: pick tactics with the highest gap-weighted lift per
 * (normalized cost + effort), until budget or person-hours run out.
 */
export function allocatePlan(input: AllocateInput): AllocationResult {
  const budget = Math.max(0, input.budgetUsd);
  const personHours = Math.max(0, input.teamSize * input.timelineWeeks * PRODUCTIVE_HOURS_PER_WEEK);
  const gaps = input.gaps ?? [];
  const weights = gapWeights(gaps);
  const library = input.tactics ?? TACTIC_LIBRARY;

  const scored = library
    .map((t) => {
      const cost = mid(t.costUsd);
      const effort = mid(t.effortHours);
      const normCost = cost / Math.max(budget, 1);
      const normEffort = effort / Math.max(personHours, 1);
      const efficiency = priorityScore(t, weights) / (normCost + normEffort + 0.01);
      return { t, cost, effort, efficiency };
    })
    .sort((a, b) => b.efficiency - a.efficiency);

  const chosen: ChosenTactic[] = [];
  let spentUsd = 0;
  let spentHours = 0;
  for (const { t, cost, effort } of scored) {
    if (spentUsd + cost > budget) continue;
    if (spentHours + effort > personHours) continue;
    spentUsd += cost;
    spentHours += effort;
    chosen.push({
      id: t.id,
      name: t.name,
      costUsd: cost,
      effortHours: effort,
      leadWeeks: t.leadWeeks,
      totalLift: totalLiftOf(t),
      foundationalMultiplier: t.foundationalMultiplier ?? 1,
      closesGap: closesGapFor(t, gaps),
      description: t.description,
    });
  }

  return { personHours, budgetUsd: budget, tactics: chosen, spentUsd, spentHours };
}

// ── Step 5: projection ───────────────────────────────────────────────────────
export type Confidence = "high" | "medium" | "low";

export interface Grounding {
  gsc?: boolean; // real traffic/queries connected
  crawl?: boolean; // real crawled citation evidence (Firecrawl/Perplexity)
  ahrefs?: boolean; // backlink data
}

export interface ProjectImpactInput {
  currentCitationShare: number; // 0..1 from the benchmark
  tactics: ChosenTactic[];
  timelineWeeks: number;
  grounding?: Grounding;
  assumptions?: Partial<typeof DEFAULT_ASSUMPTIONS>;
}

export interface Projection {
  currentCitationShare: number;
  targetCitationShare: number;
  projectedShareGain: number;
  projectedTrafficUplift: number; // extra AI-referred sessions / month
  projectedConversions: number; // / month
  timelineWeeks: number;
  confidence: Confidence;
  assumptions: string[];
  disclaimer: string;
}

function confidenceFrom(g: Grounding | undefined): Confidence {
  if (!g) return "low";
  if (g.gsc && (g.crawl || g.ahrefs)) return "high";
  if (g.crawl || g.ahrefs || g.gsc) return "medium";
  return "low";
}

/**
 * Modeled projection — NEVER a guarantee. Confidence is `high` ONLY when grounded by
 * real data (GSC + crawl/Ahrefs); otherwise medium/low, and every assumption is listed.
 */
export function projectImpact(input: ProjectImpactInput): Projection {
  const a = { ...DEFAULT_ASSUMPTIONS, ...(input.assumptions ?? {}) };
  const current = clamp01(input.currentCitationShare);

  // Effective lift = sum of raw tactic lifts × combined foundational multipliers.
  const rawLift = input.tactics.reduce((s, t) => s + t.totalLift, 0);
  const foundationalMult = input.tactics.reduce(
    (m, t) => m * (t.foundationalMultiplier > 1 ? t.foundationalMultiplier : 1),
    1,
  );
  const effectiveLift = rawLift * foundationalMult;

  const projectedShareGain = Math.min(MAX_SHARE_GAIN, effectiveLift * LIFT_TO_SHARE);
  const targetCitationShare = Math.min(SHARE_CAP, current + projectedShareGain);

  const projectedTrafficUplift = Math.round(
    a.categorySearchVolume * a.aiQueryFraction * projectedShareGain * a.citationClickRate,
  );
  const projectedConversions = Math.round(projectedTrafficUplift * a.conversionRate);

  const grounded = input.grounding ?? {};
  const confidence = confidenceFrom(input.grounding);

  const assumptions: string[] = [
    `Citation share → traffic uses a category volume of ${a.categorySearchVolume.toLocaleString()} monthly searches ${grounded.gsc ? "(from GSC)" : "(assumed — connect GSC to ground this)"}.`,
    `${Math.round(a.aiQueryFraction * 100)}% of category queries assumed to happen via AI assistants.`,
    `${Math.round(a.citationClickRate * 100)}% assumed click-through when cited in an AI answer.`,
    `${(a.conversionRate * 100).toFixed(1)}% assumed visit→conversion rate.`,
    `Each tactic contributes a fixed citation-lift; effect is capped at +${Math.round(MAX_SHARE_GAIN * 100)}pp and ${Math.round(SHARE_CAP * 100)}% share.`,
    grounded.crawl
      ? "Gaps are grounded in real crawled competitor citations."
      : "Gaps not yet grounded in crawled evidence — run Diagnose to raise confidence.",
  ];

  return {
    currentCitationShare: current,
    targetCitationShare,
    projectedShareGain,
    projectedTrafficUplift,
    projectedConversions,
    timelineWeeks: input.timelineWeeks,
    confidence,
    assumptions,
    disclaimer:
      "This is a MODELED projection based on the assumptions above, not a guarantee. Actual results vary with execution quality, competition, and how AI assistants weight sources.",
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
