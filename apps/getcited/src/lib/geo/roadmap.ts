import "server-only";
import type { ProviderKeys } from "./types";
import { generateObject } from "ai";
import { z } from "zod";
import { defaultModel } from "./providers";
import type { ChosenTactic, Gap, Projection } from "./plan";
import type { RoadmapDoc } from "./schedule";

export type { RoadmapDoc, RoadmapWeek, RoadmapAction } from "./schedule";
export { normalizeRoadmap } from "./schedule";

/**
 * Week-by-week execution roadmap: expands the allocator's tactic list into a
 * manager-shareable schedule. Per action: WHAT (the action), WHY (which citation
 * gap/evidence it closes), HOW (step-by-step guideline), WHO (owner role), hours
 * and deliverable — plus overall execution guidelines for the whole plan.
 * Grounded strictly in the chosen tactics + gaps — the model schedules and
 * details, it does not invent new spend.
 */

export const ROADMAP_MODEL_ID = "claude-sonnet-4-6";

const ActionSchema = z.object({
  tactic_id: z.string().describe("Id of the tactic this action belongs to."),
  action: z.string().describe("WHAT: concrete, assignable action (verb-first)."),
  why: z
    .string()
    .describe(
      "WHY: which citation gap or evidence this closes and why it moves AI citation share — reference the given gaps, never invent data.",
    ),
  how: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("HOW: step-by-step execution guideline a non-expert can follow."),
  owner_role: z.string().describe("WHO: owner as a role (e.g. 'Content writer')."),
  hours: z.number().describe("Estimated person-hours."),
  deliverable: z.string().describe("The tangible output of the action."),
});

const WeekSchema = z.object({
  week: z.number().int().min(1),
  theme: z.string().describe("One-line focus of the week."),
  actions: z.array(ActionSchema).min(1).max(6),
  kpi_checkpoint: z.string().describe("What to measure at the end of this week."),
});

export const RoadmapSchema = z.object({
  weeks: z.array(WeekSchema).min(2).max(16),
  guidelines: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe(
      "Overall execution guidelines for the whole plan: cadence, quality bar, review ritual, what to do when a week slips.",
    ),
});

export async function generateRoadmap(params: {
  keys: ProviderKeys;
  brand: string;
  tactics: ChosenTactic[];
  gaps: Gap[];
  projection: Projection;
  timelineWeeks: number;
  teamSize: number;
}): Promise<RoadmapDoc> {
  const tacticLines = params.tactics
    .map(
      (t) =>
        `- id=${t.id} "${t.name}" — $${t.costUsd.toFixed(0)}, ~${Math.round(t.effortHours)}h, lead ${t.leadWeeks[0]}–${t.leadWeeks[1]}wk${t.closesGap ? `, closes the "${t.closesGap}" gap` : ""}`,
    )
    .join("\n");
  const gapLines = params.gaps
    .slice(0, 6)
    .map((g) => `- ${g.sourceType}: you ${g.you} vs category ${g.leader} (deficit ${g.deficit})`)
    .join("\n");

  const req = {
    model: defaultModel(params.keys),
    schema: RoadmapSchema,
    system:
      "You are a GEO (Generative Engine Optimization) program manager. Turn an approved tactic " +
      "list into a realistic week-by-week execution roadmap a manager can hand to their team. " +
      "Sequence by lead time (outreach-heavy tactics start early), respect the team's weekly " +
      "capacity, make every action concrete and assignable, and only use the given tactics — " +
      "never invent new spend. For every action: `why` must reference the citation gap or " +
      "evidence it closes (from the given gaps), and `how` must be practical numbered steps a " +
      "non-expert can execute. Close with overall execution guidelines for running the plan.",
    prompt:
      `Brand: ${params.brand}\n` +
      `Timeline: ${params.timelineWeeks} weeks · Team: ${params.teamSize} people (~${params.teamSize * 25}h/wk)\n` +
      `Target: citation share ${(params.projection.currentCitationShare * 100).toFixed(0)}% → ~${(params.projection.targetCitationShare * 100).toFixed(0)}%\n\n` +
      `Citation gaps to close:\n${gapLines || "- (none identified)"}\n\n` +
      `Approved tactics:\n${tacticLines}\n\n` +
      `Produce ${Math.min(params.timelineWeeks, 12)} weeks. Every tactic must appear in at least one week.`,
    maxOutputTokens: 4096,
    maxRetries: 0,
    experimental_telemetry: { isEnabled: false, functionId: "roadmap" },
  };
  const res = await generateObject(req);
  return res.object;
}
