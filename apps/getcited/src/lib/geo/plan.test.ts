import { describe, it, expect } from "vitest";
import {
  allocatePlan,
  projectImpact,
  computeGap,
  buildCitationProfile,
  categorizeSource,
  emptyProfile,
  PRODUCTIVE_HOURS_PER_WEEK,
  type CitationProfile,
} from "./plan";

function profile(p: Partial<CitationProfile>): CitationProfile {
  return { ...emptyProfile(), ...p };
}

describe("categorizeSource", () => {
  it("classifies known source types", () => {
    expect(categorizeSource("https://www.reddit.com/r/x/abc")).toBe("reddit");
    expect(categorizeSource("https://youtu.be/abc")).toBe("youtube");
    expect(categorizeSource("https://www.g2.com/products/x")).toBe("review");
    expect(categorizeSource("https://x.com/foo")).toBe("social");
    expect(categorizeSource("https://blog.acme.com/best-image-tools")).toBe("roundup");
    expect(categorizeSource("https://you.com/x", { ownedDomains: ["you.com"] })).toBe("owned");
    expect(categorizeSource("https://techcrunch.com/2026/01/x")).toBe("editorial");
    expect(categorizeSource("https://random.example/page")).toBe("other");
  });
});

describe("computeGap", () => {
  it("returns positive deficits, biggest first", () => {
    const you = profile({ owned: 0, review: 0, roundup: 0 });
    const leader = profile({ owned: 11, roundup: 8, review: 4 });
    const gaps = computeGap(you, leader);
    expect(gaps[0]!.sourceType).toBe("owned");
    expect(gaps[0]!.deficit).toBe(11);
    expect(gaps.map((g) => g.sourceType)).toEqual(["owned", "roundup", "review"]);
    // no gap where you already lead
    expect(computeGap(profile({ owned: 5 }), profile({ owned: 2 }))).toEqual([]);
  });
});

describe("allocatePlan (greedy knapsack)", () => {
  const gaps = computeGap(
    emptyProfile(),
    profile({ roundup: 8, review: 6, owned: 11 }),
  );

  it("respects the budget and person-hours ceilings", () => {
    const res = allocatePlan({ budgetUsd: 400, teamSize: 2, timelineWeeks: 8, gaps });
    expect(res.personHours).toBe(2 * 8 * PRODUCTIVE_HOURS_PER_WEEK); // 400h
    expect(res.spentUsd).toBeLessThanOrEqual(400);
    expect(res.spentHours).toBeLessThanOrEqual(res.personHours);
    expect(res.tactics.length).toBeGreaterThan(0);
  });

  it("prioritizes tactics that fill the biggest gaps", () => {
    const res = allocatePlan({ budgetUsd: 400, teamSize: 2, timelineWeeks: 8, gaps });
    const ids = res.tactics.map((t) => t.id);
    // owned/review gaps are free to fill and highest-weighted → always chosen.
    expect(ids).toContain("comparison_pages"); // owned
    expect(ids).toContain("review_profiles"); // review
    // foundational schema/llms.txt is free and amplifies → chosen.
    expect(ids).toContain("schema_llmstxt");
    // at least one chosen tactic is tagged as closing a real gap
    expect(res.tactics.some((t) => t.closesGap !== null)).toBe(true);
  });

  it("with $0 budget picks only zero-cost tactics", () => {
    const res = allocatePlan({ budgetUsd: 0, teamSize: 2, timelineWeeks: 8, gaps });
    expect(res.spentUsd).toBe(0);
    expect(res.tactics.every((t) => t.costUsd === 0)).toBe(true);
  });

  it("with no capacity picks nothing", () => {
    const res = allocatePlan({ budgetUsd: 0, teamSize: 0, timelineWeeks: 0, gaps });
    expect(res.tactics).toEqual([]);
    expect(res.spentHours).toBe(0);
  });
});

describe("projectImpact (modeled, honest)", () => {
  const gaps = computeGap(emptyProfile(), profile({ roundup: 8, review: 6, owned: 11 }));
  const plan = allocatePlan({ budgetUsd: 400, teamSize: 2, timelineWeeks: 8, gaps });

  it("reproduces the worked example: 5% → ~22% (±5pp)", () => {
    const proj = projectImpact({
      currentCitationShare: 0.05,
      tactics: plan.tactics,
      timelineWeeks: 8,
      grounding: { crawl: true },
    });
    expect(proj.targetCitationShare).toBeGreaterThan(0.17);
    expect(proj.targetCitationShare).toBeLessThan(0.27);
    expect(proj.projectedShareGain).toBeGreaterThan(0);
    expect(proj.projectedTrafficUplift).toBeGreaterThan(0);
  });

  it("confidence is high ONLY when grounded by real data", () => {
    const base = { currentCitationShare: 0.05, tactics: plan.tactics, timelineWeeks: 8 };
    expect(projectImpact({ ...base }).confidence).toBe("low"); // no grounding
    expect(projectImpact({ ...base, grounding: { crawl: true } }).confidence).toBe("medium");
    expect(projectImpact({ ...base, grounding: { gsc: true, crawl: true } }).confidence).toBe("high");
  });

  it("always lists assumptions and a not-a-guarantee disclaimer", () => {
    const proj = projectImpact({ currentCitationShare: 0.05, tactics: plan.tactics, timelineWeeks: 8 });
    expect(proj.assumptions.length).toBeGreaterThanOrEqual(4);
    expect(proj.disclaimer.toLowerCase()).toContain("not a guarantee");
  });

  it("with no tactics/budget projects ~current share, no NaN, never high confidence", () => {
    const proj = projectImpact({ currentCitationShare: 0.05, tactics: [], timelineWeeks: 8 });
    expect(proj.projectedShareGain).toBe(0);
    expect(proj.targetCitationShare).toBeCloseTo(0.05, 6);
    expect(Number.isNaN(proj.projectedTrafficUplift)).toBe(false);
    expect(proj.projectedConversions).toBe(0);
    expect(proj.confidence).not.toBe("high");
  });

  it("caps the projected share (never runaway)", () => {
    const huge = Array.from({ length: 30 }, () => plan.tactics).flat();
    const proj = projectImpact({ currentCitationShare: 0.5, tactics: huge, timelineWeeks: 8 });
    expect(proj.targetCitationShare).toBeLessThanOrEqual(0.6);
  });

  it("handles a NaN/garbage current share safely", () => {
    const proj = projectImpact({ currentCitationShare: NaN, tactics: plan.tactics, timelineWeeks: 8 });
    expect(Number.isFinite(proj.targetCitationShare)).toBe(true);
    expect(proj.currentCitationShare).toBe(0);
  });
});

describe("buildCitationProfile", () => {
  it("counts citations per source type", () => {
    const p = buildCitationProfile([
      { sourceType: "roundup" },
      { sourceType: "roundup" },
      { sourceType: "review" },
    ]);
    expect(p.roundup).toBe(2);
    expect(p.review).toBe(1);
    expect(p.owned).toBe(0);
  });
});
