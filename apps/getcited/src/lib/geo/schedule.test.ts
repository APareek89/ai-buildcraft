import { describe, it, expect } from "vitest";
import {
  normalizeRoadmap,
  weekStartDate,
  weekDueDate,
  isoDate,
  fmtWeekRange,
  trackerRowsFromRoadmap,
} from "./schedule";

const CREATED = "2026-07-17T09:30:00.000Z";

describe("week date derivation (due dates = plan creation + week offsets)", () => {
  it("week 1 starts on the plan creation date", () => {
    expect(isoDate(weekStartDate(CREATED, 1))).toBe("2026-07-17");
  });

  it("week 1 is due 7 days after creation", () => {
    expect(isoDate(weekDueDate(CREATED, 1))).toBe("2026-07-24");
  });

  it("week 8 is due 56 days after creation", () => {
    expect(isoDate(weekDueDate(CREATED, 8))).toBe("2026-09-11");
  });

  it("week N start == week N-1 due (contiguous weeks)", () => {
    expect(weekStartDate(CREATED, 5).getTime()).toBe(weekDueDate(CREATED, 4).getTime());
  });

  it("rolls over month and year boundaries", () => {
    expect(isoDate(weekDueDate("2026-12-29T00:00:00.000Z", 1))).toBe("2027-01-05");
  });

  it("accepts Date input too", () => {
    expect(isoDate(weekDueDate(new Date(CREATED), 2))).toBe("2026-07-31");
  });

  it("formats a readable week range", () => {
    expect(fmtWeekRange(CREATED, 1)).toBe("Jul 17 – Jul 24, 2026");
  });
});

describe("normalizeRoadmap (legacy array vs current {weeks, guidelines})", () => {
  const week = { week: 1, theme: "t", actions: [], kpi_checkpoint: "k" };

  it("wraps a legacy week array", () => {
    expect(normalizeRoadmap([week])).toEqual({ weeks: [week], guidelines: [] });
  });

  it("passes through the current doc shape", () => {
    const doc = { weeks: [week], guidelines: ["ship weekly"] };
    expect(normalizeRoadmap(doc)).toEqual(doc);
  });

  it("defaults missing guidelines to []", () => {
    expect(normalizeRoadmap({ weeks: [week] })).toEqual({ weeks: [week], guidelines: [] });
  });

  it("returns an empty doc for null/garbage", () => {
    expect(normalizeRoadmap(null)).toEqual({ weeks: [], guidelines: [] });
    expect(normalizeRoadmap("nope")).toEqual({ weeks: [], guidelines: [] });
    expect(normalizeRoadmap({ foo: 1 })).toEqual({ weeks: [], guidelines: [] });
  });
});

describe("trackerRowsFromRoadmap (approve_plan row derivation)", () => {
  const roadmap = {
    weeks: [
      {
        week: 1,
        theme: "kickoff",
        kpi_checkpoint: "k1",
        actions: [
          { tactic_id: "t1", action: "Write comparison page", owner_role: "Writer", hours: 8, deliverable: "Draft" },
          { tactic_id: "t2", action: "Pitch 3 roundups", owner_role: "Marketer", hours: 4, deliverable: "3 emails" },
        ],
      },
      {
        week: 3,
        theme: "outreach",
        kpi_checkpoint: "k3",
        actions: [{ tactic_id: "t2", action: "Follow up", owner_role: "Marketer", hours: 2, deliverable: "Replies" }],
      },
    ],
    guidelines: ["g"],
  };

  it("flattens actions with due dates from plan creation + week offsets", () => {
    const rows = trackerRowsFromRoadmap(CREATED, roadmap);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      week: 1,
      due_date: "2026-07-24",
      action: "Write comparison page",
      owner_role: "Writer",
      hours: 8,
      deliverable: "Draft",
    });
    expect(rows[2]!.week).toBe(3);
    expect(rows[2]!.due_date).toBe("2026-08-07"); // creation + 21 days
  });

  it("handles legacy array-shaped roadmaps and empty/garbage input", () => {
    const rows = trackerRowsFromRoadmap(CREATED, roadmap.weeks);
    expect(rows).toHaveLength(3);
    expect(trackerRowsFromRoadmap(CREATED, null)).toEqual([]);
  });

  it("nulls missing owner/hours/deliverable instead of crashing", () => {
    const rows = trackerRowsFromRoadmap(CREATED, {
      weeks: [{ week: 2, theme: "x", kpi_checkpoint: "k", actions: [{ tactic_id: "t", action: "Do it" }] }],
    });
    expect(rows[0]).toEqual({
      week: 2,
      due_date: "2026-07-31",
      action: "Do it",
      owner_role: null,
      hours: null,
      deliverable: null,
    });
  });
});
