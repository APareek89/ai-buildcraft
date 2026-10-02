import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { verifyMcpToken, publicOrigin } from "@/lib/mcp/auth";
import {
  mcpActiveConfig,
  mcpSavePlan,
  mcpLatestPlan,
  mcpApprovePlan,
  mcpTrackerItems,
  McpGeoStore,
  persistCitations,
} from "@/lib/mcp/data";
import {
  InProcessPanelRunner,
  buildReport,
  computeCitations,
  computeSentiment,
  allocatePlan,
  projectImpact,
  type PanelistId,
  type AnalysisAnswer,
} from "@/lib/geo";
import { costCapUsd } from "@/lib/geo/keys";
import { diagnoseFromReport } from "@/lib/geo/diagnose";
import { generateRoadmap, type RoadmapDoc } from "@/lib/geo/roadmap";
import { generateContent, CONTENT_TYPES } from "@/lib/geo/content";

import {resolveKeys} from "@/lib/server/keys";
import {executionFor,runWithExecution,requireExecution} from "@/lib/server/execution";
import {withCapacity} from "@/lib/server/usage";
import {requireWorkspaceRoom} from "@/lib/server/workspace";
import {readBytes,json,route,HttpError} from "@/lib/server/http";
import {userLimit} from "@/lib/server/security";
export const maxDuration = 180;

/**
 * The GetCited MCP endpoint (streamable HTTP, stateless) — POST /mcp.
 * Top-level path (basePath "") so the deployed URL matches the legacy
 * geo-radar connector URL https://mcp.example.com/mcp exactly —
 * existing claude.ai connectors re-auth in place, no URL edit needed.
 * Auth: bearer JWT from our self-hosted OAuth (sub = user id), or the static
 * MCP_API_KEY (maps to nothing user-specific → config tools return guidance).
 * Tool logic mirrors /api/chat but reads via the user-scoped Drizzle store.
 */

function userIdOf(auth: AuthInfo | undefined): string | null {
  const sub = auth?.extra?.sub;
  return sub===requireExecution().ownerId?sub as string:null;
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "ping",
      "Health check — verifies the connector is wired and authenticated.",
      {},
      async (_args, extra) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              server: "getcited",
              authenticated_user: userIdOf(extra.authInfo) ? "yes" : "api-key (no user context)",
            }),
          },
        ],
      }),
    );

    server.tool(
      "get_active_config",
      "Load the signed-in user's saved GetCited config (brand, competitors, queries, budget, team).",
      {},
      async (_args, extra) => {
        const userId = userIdOf(extra.authInfo);
        if (!userId) return text({ error: "No user context — connect via OAuth (install the connector), not a static key." });
        const cfg = await mcpActiveConfig(userId);
        if (!cfg) return text({ configured: false, message: "No config yet — fill in Configure in the GetCited app." });
        return text({
          configured: true,
          prepared:cfg.prepared,
          brand: cfg.brandName || cfg.brandUrl,
          competitors: cfg.competitors,
          queries: cfg.queries,
          budget_usd: cfg.budgetUsd,
          team_size: cfg.teamSize,
          timeline_weeks: cfg.timelineWeeks,
        });
      },
    );

    server.tool(
      "run_benchmark",
      "Run an AI panel → share-of-voice, citation share and sentiment for the brand vs competitors. Uses the saved config; costs a few cents (capped).",
      {
        brand: z.string().max(120).optional().describe("Override the brand to measure."),
        competitors: z.array(z.string().max(300)).max(15).optional(),
        queries: z.array(z.string().max(2000)).max(12).optional(),
      },
      async (args, extra) => {
        const userId = userIdOf(extra.authInfo);
        if (!userId) return text({ error: "No user context — install the connector via OAuth." });
        const cfg = await mcpActiveConfig(userId);
        if(cfg?.prepared)throw new HttpError(409,'Prepared configuration is read-only. Save an ordinary version first.');
        await requireWorkspaceRoom();
        const brand = args.brand || cfg?.brandName || cfg?.brandUrl;
        const competitors = args.competitors ?? cfg?.competitors ?? [];
        const queries = args.queries ?? cfg?.queries ?? [];
        if (!brand) return text({ error: "No brand configured. Set it in the GetCited app or pass `brand`." });
        if (competitors.length === 0) return text({ error: "No competitors configured." });
        if (queries.length === 0) return text({ error: "No queries configured — add them in Configure." });

        const keys = await resolveKeys(undefined,cfg?.mode);
        const panel: PanelistId[] = [keys.openai?"openai":"haiku"];
        if (keys.perplexity) panel.push("perplexity");
        if (keys.custom) panel.push("custom");
        const store = new McpGeoStore(userId, cfg?.id ?? null);
        const runner = new InProcessPanelRunner(store, { costCapUsd: costCapUsd(), keys,forceMock:requireExecution().mode==="mock",parserMode:"deterministic" });
        const out = await runner.run({
          brand,
          brand_domains: cfg?.brandDomains ?? [],
          competitors,
          prompts: queries,
          panel,
        });
        const report = await buildReport(store, out.report_id);
        const analysis: AnalysisAnswer[] = (report?.answers ?? []).map((a) => ({
          prompt: a.prompt,
          rawAnswer: "",
          citedDomains: a.cited_domains,
          sentiment: a.sentiment,
        }));
        const citations = computeCitations(brand, analysis, cfg?.brandDomains ?? []);
        const sentiment = computeSentiment(brand, analysis);
        return text({
          report_id: out.report_id,
          share_of_voice: out.share_of_voice,
          your_citation_share: citations.your_citation_share,
          sentiment: { score: sentiment.sentiment_score, distribution: sentiment.distribution },
          cost_usd: out.cost_usd,
          ...(out.panel_warning ? { panel_warning: out.panel_warning } : {}),
        });
      },
    );

    server.tool(
      "get_report",
      "Fetch a previously-run benchmark report by report_id.",
      { report_id: z.string().min(1) },
      async (args, extra) => {
        const userId = userIdOf(extra.authInfo);
        if (!userId) return text({ error: "No user context — install the connector via OAuth." });
        const report = await buildReport(new McpGeoStore(userId), args.report_id);
        if (!report) return text({ error: "Report not found (or not yours)." });
        return text({
          report_id: report.report_id,
          status: report.status,
          prepared:report.prepared,
          brand: report.brand,
          share_of_voice: report.share_of_voice,
          per_prompt: report.per_prompt,
          cost_usd: report.cost_usd,
        });
      },
    );

    server.tool(
      "build_plan",
      "Build a costed action plan (greedy allocation within budget + person-hours) with a MODELED projection — assumptions listed, never a guarantee. Runs a fresh benchmark unless report_id is given.",
      {
        report_id: z.string().optional(),
        budget_usd: z.number().min(0).max(1000000).optional(),
        team_size: z.number().int().min(1).max(100).optional(),
        timeline_weeks: z.number().int().min(1).max(104).optional(),
      },
      async (args, extra) => {
        const userId = userIdOf(extra.authInfo);
        if (!userId) return text({ error: "No user context — install the connector via OAuth." });
        const cfg = await mcpActiveConfig(userId);
        const store = new McpGeoStore(userId, cfg?.id ?? null);
        const brand = cfg?.brandName || cfg?.brandUrl || "";
        const ownedDomains = cfg?.brandDomains ?? [];

        let report = args.report_id ? await buildReport(store, args.report_id) : null;
        if(args.report_id&&!report)throw new HttpError(404,"Report not found.");
        if(report?.prepared||cfg?.prepared)throw new HttpError(409,"Prepared evidence cannot trigger paid or crawl work.");
        await requireWorkspaceRoom();
        if (!report) {
          if (!brand || !cfg?.competitors?.length || !cfg?.queries?.length) {
            return text({ error: "No config to benchmark from — fill in Configure first." });
          }
          const keys = await resolveKeys(undefined,cfg?.mode);
          const panel: PanelistId[] = [keys.openai?"openai":"haiku"];
          if (keys.perplexity) panel.push("perplexity");
          if (keys.custom) panel.push("custom");
          const runner = new InProcessPanelRunner(store, { costCapUsd: costCapUsd(), keys,forceMock:requireExecution().mode==="mock",parserMode:"deterministic" });
          const out = await runner.run({
            brand,
            brand_domains: ownedDomains,
            competitors: cfg.competitors,
            prompts: cfg.queries,
            panel,
          });
          report = await buildReport(store, out.report_id);
        }
        if (!report) return text({ error: "Benchmark failed to produce a report." });

        const dx = await diagnoseFromReport(report, { brand, ownedDomains, crawl: true });
        if (dx.crawled?.length) {
          try { await persistCitations(userId, report.report_id, dx.crawled); } catch { /* best-effort */ }
        }
        const budget = args.budget_usd ?? cfg?.budgetUsd ?? 400;
        const team = args.team_size ?? cfg?.teamSize ?? 2;
        const weeks = args.timeline_weeks ?? cfg?.timelineWeeks ?? 8;
        const allocation = allocatePlan({ budgetUsd: budget, teamSize: team, timelineWeeks: weeks, gaps: dx.gap });
        const projection = projectImpact({
          currentCitationShare: dx.currentCitationShare,
          tactics: allocation.tactics,
          timelineWeeks: weeks,
          grounding: { crawl: dx.crawlGrounded },
        });
        let roadmap: RoadmapDoc = { weeks: [], guidelines: [] };
        let roadmapError: string | null = null;
        try {
          roadmap = await generateRoadmap({
            keys:await resolveKeys(undefined,cfg?.mode),
            brand,
            tactics: allocation.tactics,
            gaps: dx.gap,
            projection,
            timelineWeeks: weeks,
            teamSize: team,
          });
        } catch (e) {
          roadmapError = "Provider did not return a complete roadmap. Dispatched usage is recorded.";
        }
        const saved = await mcpSavePlan({
          userId,
          configId: cfg?.id ?? null,
          configVersion: cfg?.version ?? null,
          runId: report.report_id,
          tactics: allocation.tactics,
          projection,
          roadmap,
        });
        return text({
          plan_id: saved.id,
          tactics: allocation.tactics,
          projection,
          roadmap,
          spent_usd: allocation.spentUsd,
          spent_hours: allocation.spentHours,
          roadmap_error: roadmapError
            ? `Week-by-week roadmap generation failed (${roadmapError}) — rebuild the plan to retry.`
            : undefined,
        });
      },
    );

    server.tool(
      "get_latest_plan",
      "Fetch the user's most recent action plan (tactics, projection, week-by-week roadmap).",
      {},
      async (_args, extra) => {
        const userId = userIdOf(extra.authInfo);
        if (!userId) return text({ error: "No user context — install the connector via OAuth." });
        const plan = await mcpLatestPlan(userId);
        if (!plan) return text({ error: "No plan yet — run build_plan first." });
        return text(plan);
      },
    );

    server.tool(
      "approve_plan",
      "Approve a plan into the user's Tracker: one editable execution item per roadmap action, due dates derived from the plan creation date (week N due N×7 days later). Idempotent. Defaults to the latest plan. Only call when the user has explicitly approved.",
      { plan_id: z.string().optional(), confirm: z.literal(true) },
      async (args, extra) => {
        const userId = userIdOf(extra.authInfo);
        if (!userId) return text({ error: "No user context — install the connector via OAuth." });
        return text(await mcpApprovePlan(userId, args.plan_id));
      },
    );

    server.tool(
      "get_tracker",
      "Read the Tracker execution items (status + remarks the user maintains) for the latest approved plan, or a specific plan_id. This is the PRIMARY source for progress questions.",
      { plan_id: z.string().optional() },
      async (args, extra) => {
        const userId = userIdOf(extra.authInfo);
        if (!userId) return text({ error: "No user context — install the connector via OAuth." });
        const tracker = await mcpTrackerItems(userId, args.plan_id);
        if (!tracker)
          return text({
            approved: false,
            message: "No plan has been approved into the Tracker yet — run approve_plan (with user consent).",
          });
        const counts = { not_started: 0, in_progress: 0, done: 0, blocked: 0 };
        for (const i of tracker.items) {
          if (i.status in counts) counts[i.status as keyof typeof counts] += 1;
        }
        return text({
          approved: true,
          plan_id: tracker.plan_id,
          total_items: tracker.items.length,
          status_counts: counts,
          done_pct: Math.round((counts.done / Math.max(1, tracker.items.length)) * 100),
          items: tracker.items,
        });
      },
    );

    server.tool(
      "generate_content",
      "Write GEO-optimized content for a tactic: blog_post, comparison_page, reddit_answer, linkedin_post, guest_post_pitch, review_request_email, youtube_brief. Returns markdown.",
      {
        type: z.enum(CONTENT_TYPES),
        topic: z.string().min(3).max(2000).describe("The assignment, e.g. 'YourBrand vs Competitor comparison page'."),
      },
      async (args, extra) => {
        const userId = userIdOf(extra.authInfo);
        if (!userId) return text({ error: "No user context — install the connector via OAuth." });
        const cfg = await mcpActiveConfig(userId);
        const plan = await mcpLatestPlan(userId);
        const keys = await resolveKeys(undefined,cfg?.mode);
        if(cfg?.prepared||plan?.prepared)throw new HttpError(409,"Prepared context cannot trigger paid content generation.");
        await requireWorkspaceRoom();
        const markdown = await generateContent({
          keys,
          type: args.type,
          topic: args.topic,
          brand: cfg?.brandName || cfg?.brandUrl || "the brand",
          brandUrl: cfg?.brandUrl,
          description: cfg?.description,
          competitors: cfg?.competitors,
          queries: cfg?.queries,
          planContext: plan ? `Tactics: ${plan.tactics.map((t) => t.name).join("; ")}` : undefined,
        });
        return text({ type: args.type, topic: args.topic, markdown });
      },
    );
  },
  {
    serverInfo: { name: "getcited", version: "0.1.0" },
  },
  {
    basePath: "", // endpoints derive to top-level /mcp (matches this file's route path)
    maxDuration: 300,
    disableSse: true,
    verboseLogs: false,
  },
);

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Bearer verification (ported from geo-radar requireAuth): static MCP_API_KEY match,
 * else our self-issued HS256 JWT. Returning undefined → 401 with WWW-Authenticate
 * pointing at /.well-known/oauth-protected-resource so Claude starts the OAuth flow.
 */
const verifyToken = async (req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
  if (!bearer) return undefined;
  try {
    const info = await verifyMcpToken(bearer, publicOrigin(req));
    return {
      token: info.token,
      clientId: info.clientId,
      scopes: info.scopes,
      expiresAt: info.expiresAt,
      extra: { sub: info.userId },
    };
  } catch {
    return undefined;
  }
};

const authedHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

const protectedHandler=route(async(req:Request)=>{
 const authorization=req.headers.get('authorization')??'';
 if(!/^Bearer [A-Za-z0-9_.-]{1,4096}$/.test(authorization))return json({error:'Reconnect your MCP account.'},401,{'WWW-Authenticate':`Bearer resource_metadata="${publicOrigin()}/.well-known/oauth-protected-resource"`});
 let actor;try{actor=await verifyMcpToken(authorization.slice(7));}catch{throw new HttpError(401,'Reconnect your MCP account.');}
 await userLimit({id:actor.userId},'mcp',60,60);
 let bounded=req;if(req.method==='POST'){const body=await readBytes(req,256*1024);bounded=new Request(req.url,{method:req.method,headers:req.headers,body});}
 const context={...executionFor({id:actor.userId,sid:actor.sessionId}),grantId:actor.grantId};
 return runWithExecution(context,()=>withCapacity(()=>authedHandler(bounded)));
});
export {protectedHandler as GET,protectedHandler as POST,protectedHandler as DELETE};
