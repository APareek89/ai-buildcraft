/**
 * Roadmap shape + schedule derivation. Pure (no server-only, no deps) so it is
 * shared by report builders, chat/MCP tools, the Tracker, and unit tests.
 */

export interface RoadmapAction {
  tactic_id: string;
  /** WHAT — concrete, assignable action. */
  action: string;
  /** WHY — which citation gap / evidence this closes (absent on legacy plans). */
  why?: string;
  /** HOW — step-by-step execution guideline (absent on legacy plans). */
  how?: string[];
  /** WHO — owner as a role. */
  owner_role: string;
  hours: number;
  deliverable: string;
}

export interface RoadmapWeek {
  week: number;
  theme: string;
  actions: RoadmapAction[];
  kpi_checkpoint: string;
}

export interface RoadmapDoc {
  weeks: RoadmapWeek[];
  /** Overall execution guidelines for the whole plan (empty on legacy plans). */
  guidelines: string[];
}

/** Accept both storage shapes: legacy `RoadmapWeek[]` and current `{weeks, guidelines}`. */
export function normalizeRoadmap(raw: unknown): RoadmapDoc {
  if (Array.isArray(raw)) return { weeks: raw as RoadmapWeek[], guidelines: [] };
  if (raw && typeof raw === "object" && Array.isArray((raw as { weeks?: unknown }).weeks)) {
    const doc = raw as { weeks: RoadmapWeek[]; guidelines?: unknown };
    return {
      weeks: doc.weeks,
      guidelines: Array.isArray(doc.guidelines) ? (doc.guidelines as string[]) : [],
    };
  }
  return { weeks: [], guidelines: [] };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Week N (1-based) starts (N-1)*7 days after the plan's creation date. */
export function weekStartDate(planCreatedAt: string | Date, week: number): Date {
  return new Date(new Date(planCreatedAt).getTime() + (week - 1) * 7 * DAY_MS);
}

/** Week N is due when it ends — N*7 days after plan creation. */
export function weekDueDate(planCreatedAt: string | Date, week: number): Date {
  return new Date(new Date(planCreatedAt).getTime() + week * 7 * DAY_MS);
}

/** ISO date (yyyy-mm-dd) — the canonical value stored in tracker_items.due_date. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Human date like "Mar 3, 2026" (fixed locale so reports render consistently). */
export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One roadmap action flattened into an executable tracker row. */
export interface TrackerRowInput {
  week: number;
  due_date: string; // ISO yyyy-mm-dd — plan creation + week*7 days
  action: string;
  owner_role: string | null;
  hours: number | null;
  deliverable: string | null;
}

/**
 * Flatten a plan's roadmap into tracker rows. Due dates derive from the plan's
 * creation date + week offsets (week N due N*7 days after creation).
 */
export function trackerRowsFromRoadmap(
  planCreatedAt: string | Date,
  roadmap: unknown,
): TrackerRowInput[] {
  const { weeks } = normalizeRoadmap(roadmap);
  return weeks.flatMap((w) =>
    (w.actions ?? []).map((a) => ({
      week: w.week,
      due_date: isoDate(weekDueDate(planCreatedAt, w.week)),
      action: a.action,
      owner_role: a.owner_role ?? null,
      hours: typeof a.hours === "number" ? a.hours : null,
      deliverable: a.deliverable ?? null,
    })),
  );
}

/** "Mar 3 – Mar 10, 2026" range for week N of a plan. */
export function fmtWeekRange(planCreatedAt: string | Date, week: number): string {
  const start = weekStartDate(planCreatedAt, week).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${start} – ${fmtDate(weekDueDate(planCreatedAt, week))}`;
}
