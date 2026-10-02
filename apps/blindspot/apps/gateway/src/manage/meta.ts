import { Hono } from "hono";
import { getOverview, getProject } from "@blindspot/core";
import type { Env } from "../types";

/** Overview KPIs + whoami (PRD §10 Overview, sign-in-with-key). Mounted under /v1. */
export const metaRouter = new Hono<Env>();

// validate a key + identify the project (backs the dashboard sign-in screen)
metaRouter.get("/me", async (c) => {
  const project = await getProject(c.get("projectId"));
  if (!project) return c.json({ error: { message: "project not found" } }, 404);
  return c.json({ project });
});

// overview KPIs + cost-vs-quality + activity feed
metaRouter.get("/overview", async (c) => {
  return c.json(await getOverview(c.get("projectId")));
});

// the configured cost cap (a number, not a secret) so Settings can show it
metaRouter.get("/settings", async (c) => {
  const cap = Number(process.env.COST_CAP_USD_PER_EVAL_RUN ?? 0);
  return c.json({
    costCapUsdPerEvalRun: cap > 0 ? cap : null,
    defaultModel: process.env.BLINDSPOT_DEFAULT_MODEL ?? null,
    judgeModel: process.env.JUDGE_MODEL ?? null,
    evalMode:
      process.env.BLINDSPOT_EVAL_MODE === "inline" || !process.env.REDIS_URL
        ? "inline"
        : "queued",
  });
});
