import {randomUUID} from 'node:crypto';
import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import {modelFor} from "@/lib/geo/providers";
import {requireActor} from "@/lib/server/auth";
import {executionFor,runWithExecution,requireExecution} from "@/lib/server/execution";
import {readJson,route,HttpError} from "@/lib/server/http";
import {acquireCapacity} from "@/lib/server/usage";
import {requireWorkspaceRoom} from "@/lib/server/workspace";
import {resolveKeys} from "@/lib/server/keys";
import {getThread,getThreadMessages} from "@/lib/db/threads";
import {userLimit} from "@/lib/server/security";
import { z } from "zod";
type User={id:string;email:string};
import { getActiveConfig, type ConfigView } from "@/lib/db/configs";
import { PostgresGeoStore } from "@/lib/db/geo-store";
import { savePlan, getLatestPlan, getPlanById } from "@/lib/db/plans";
import { latestTrackedPlanItems } from "@/lib/db/tracker";
import { saveThreadMessages } from "@/lib/db/threads";
import { listMemories, saveMemory, memoryPromptBlock } from "@/lib/db/memories";
import { persistCitations } from "@/lib/mcp/data";
import {
  InProcessPanelRunner,
  buildReport,
  computeCitations,
  computeSentiment,
  allocatePlan,
  projectImpact,
  type PanelistId,
  type AnalysisAnswer,
  type ProviderKeys,
  type FullReport,
} from "@/lib/geo";
import { costCapUsd } from "@/lib/geo/keys";
import { diagnoseFromReport } from "@/lib/geo/diagnose";
import { generateRoadmap, type RoadmapDoc } from "@/lib/geo/roadmap";
import { isoDate, weekDueDate } from "@/lib/geo/schedule";
import { generateContent, CONTENT_TYPES } from "@/lib/geo/content";
import { AGENT_SYSTEM_PROMPT, DEFAULT_AGENT_MODEL, isAgentModel } from "@/lib/geo/agent";

import { CHAT_MESSAGE_BYTES, recoverChatMessages, chatErrorMessage } from "@/lib/chat-recovery";

export const maxDuration = 300;
function persistenceFailure(error: unknown): string {
 const e=error as {status?:number;code?:string;cause?:{code?:string}};
 if(e?.status===401)return 'session_revoked';if(e?.status===408)return 'deadline';if(e?.status===413)return 'thread_limit';
 const code=e?.code??e?.cause?.code;
 return typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?'db_'+code:'unclassified';
}

function panelFor(keys: ProviderKeys): PanelistId[] {
  const panel: PanelistId[] = [keys.openai?"openai":"haiku"];
  if (keys.perplexity) panel.push("perplexity");
  if (keys.custom) panel.push("custom");
  return panel;
}

/** Run (or fetch) a benchmark and return its stored report. */
async function runBenchmark(
  user: User,
  cfg: ConfigView | null,
  keys: ProviderKeys,
  overrides?: { brand?: string; competitors?: string[]; queries?: string[] },
): Promise<
  { report: FullReport; brand: string; ownedDomains: string[]; warning?: string } | { error: string }
> {
  if(cfg?.prepared)throw new HttpError(409,'The prepared example is read-only. Save an ordinary configuration first.');
  const brand = overrides?.brand || cfg?.brandName || cfg?.brandUrl;
  const competitors = overrides?.competitors ?? cfg?.competitors ?? [];
  const queries = overrides?.queries ?? cfg?.queries ?? [];
  const ownedDomains = cfg?.brandDomains ?? [];
  if (!brand) return { error: "No brand set. Ask the user for their brand or to fill Configure." };
  if (competitors.length === 0) return { error: "No competitors set. Ask the user for at least one." };
  if (queries.length === 0) return { error: "No queries configured. Ask the user to add queries in Configure." };

  const store = new PostgresGeoStore(user.id, cfg?.id ?? null);
  const runner = new InProcessPanelRunner(store, { costCapUsd: costCapUsd(), keys,forceMock:process.env.GETCITED_MOCK_MODE==="1",parserMode:"deterministic" });
  const out = await runner.run({
    brand,
    brand_domains: ownedDomains,
    competitors,
    prompts: queries,
    panel: panelFor(keys),
  });
  const report = await buildReport(store, out.report_id);
  if (!report) return { error: "Benchmark ran but the report could not be loaded." };
  return { report, brand, ownedDomains, warning: out.panel_warning };
}

async function reportById(user: User, reportId: string): Promise<FullReport | null> {
  return buildReport(new PostgresGeoStore(user.id), reportId);
}

/** Diagnose + persist crawled evidence to the citations table. */
async function diagnoseAndPersist(
  user: User,
  report: FullReport,
  brand: string,
  ownedDomains: string[],
) {
  const dx = await diagnoseFromReport(report, { brand, ownedDomains, crawl: true });
  if (dx.crawled?.length) {
    try {
      await persistCitations(user.id, report.report_id, dx.crawled);
    } catch {
      // evidence cache is best-effort; never fail the tool on it
    }
  }
  return dx;
}

export const POST=route(async(req:Request)=>{
 const user=await requireActor(req,{write:true});await userLimit(user,'chat',20,3600);
 const body=await readJson(req,256*1024),e=executionFor(user);
 return runWithExecution({...e,signal:AbortSignal.any([req.signal,AbortSignal.timeout(120000)])},async()=>{
 const release=await acquireCapacity();try{
 const threadId=typeof body.threadId==='string'?body.threadId:'';
 const thread=threadId?await getThread(threadId):null;if(!thread)throw new HttpError(404,'Create an owned thread first.');if(thread.prepared)throw new HttpError(409,'The prepared conversation is free and read-only. Start a new thread with an ordinary configuration.');
 const cfgForKeys=await getActiveConfig();if(cfgForKeys?.prepared)throw new HttpError(409,'Save a new ordinary configuration before chatting with a provider.');
 const submitted=Array.isArray(body.messages)?body.messages:[],last=submitted.at(-1);
 if(!last||last.role!=='user'||typeof last.id!=='string'||last.id.length<1||last.id.length>200||!Array.isArray(last.parts)||last.parts.length<1||last.parts.length>10||last.parts.some((p:{type?:string;text?:unknown})=>p.type!=='text'||typeof p.text!=='string')||Buffer.byteLength(JSON.stringify(last))>CHAT_MESSAGE_BYTES)throw new HttpError(400,'Send a text message of up to 16 KiB.');
 const prior=await getThreadMessages(threadId);if(prior.length>=199||prior.some(m=>m.id===last.id))throw new HttpError(409,'Start a new message or thread.');
 const messages:UIMessage[]=[...prior,last];
 const keys=await resolveKeys(body.keys,cfgForKeys?.mode),modelId=typeof body.model==='string'&&isAgentModel(body.model)?body.model:DEFAULT_AGENT_MODEL;
 await requireWorkspaceRoom();
 let incomplete=false;
  // Persistent memory → system prompt.
  let memoryBlock = "";
  try {
    memoryBlock = memoryPromptBlock(await listMemories());
  } catch {
    memoryBlock = "";
  }

  if(modelId==='gpt-4o-mini'&&!keys.openai)throw new HttpError(400,'Add an OpenAI key for Self Serve, or select We Serve in Configure.');
  const actor=requireExecution(), model=modelFor(modelId,keys);
  const modelMessages=await convertToModelMessages(messages,{ignoreIncompleteToolCalls:true});
  // This checkpoint is committed before any provider dispatch. A broken stream
  // cannot erase the submitted turn, and a repeated message ID cannot bill twice.
  await saveThreadMessages(user.id,threadId,messages);
  const result = streamText({
    model,
    maxOutputTokens:4096,maxRetries:0,abortSignal:AbortSignal.any([req.signal,AbortSignal.timeout(Math.max(1,e.deadlineMs-Date.now()))]),
    onFinish:({finishReason})=>{incomplete=!["stop","tool-calls"].includes(finishReason);},
    onAbort:async()=>{await release();},
    system: AGENT_SYSTEM_PROMPT + memoryBlock,
    messages: modelMessages,
    stopWhen: stepCountIs(5),
    experimental_telemetry: { isEnabled: false, functionId: "geo-assistant" },
    tools: {
      get_active_config: tool({
        description: "Load the user's saved config (brand, competitors, queries, budget, team).",
        inputSchema: z.object({}),
        async execute() {
          const cfg = await getActiveConfig();
          if (!cfg) return { configured: false, message: "No config yet. Ask the user to fill Configure." };
          return {
            configured: true,
            brand: cfg.brandName || cfg.brandUrl,
            competitors: cfg.competitors,
            query_count: cfg.queries.length,
            budget_usd: cfg.budgetUsd,
            team_size: cfg.teamSize,
            timeline_weeks: cfg.timelineWeeks,
          };
        },
      }),

      run_benchmark: tool({
        description:
          "Card 1 (Benchmark). Run an AI panel → share-of-voice, citation share, sentiment for the brand vs competitors.",
        inputSchema: z.object({
          brand: z.string().optional(),
          competitors: z.array(z.string()).optional(),
          queries: z.array(z.string()).optional(),
        }),
        async execute(input) {
          const cfg = await getActiveConfig();
          const r = await runBenchmark(user, cfg, keys, input);
          if ("error" in r) return { error: r.error };
          const analysis: AnalysisAnswer[] = r.report.answers.map((a) => ({
            prompt: a.prompt,
            rawAnswer: "",
            citedDomains: a.cited_domains,
            sentiment: a.sentiment,
          }));
          const citations = computeCitations(r.brand, analysis, r.ownedDomains);
          const sentiment = computeSentiment(r.brand, analysis);
          return {
            report_id: r.report.report_id,
            brand: r.brand,
            panel: r.report.panel,
            answer_count: r.report.answers.length,
            cost_usd: r.report.cost_usd,
            share_of_voice: r.report.share_of_voice,
            your_citation_share: citations.your_citation_share,
            total_citations: citations.total_citations,
            top_cited_domains: citations.by_domain.slice(0, 8),
            citation_gap_count: citations.competitor_gap.length,
            sentiment: { score: sentiment.sentiment_score, distribution: sentiment.distribution },
            ...(r.warning ? { panel_warning: r.warning } : {}),
          };
        },
      }),

      diagnose_citations: tool({
        description:
          "Card 2 (Diagnose). Categorize where AI cites in this category vs where you're cited; find the biggest gaps. Crawls top cited pages (robots.txt respected) and caches the evidence.",
        inputSchema: z.object({ report_id: z.string().optional() }),
        async execute({ report_id }) {
          const cfg = await getActiveConfig();
          let report: FullReport | null = report_id ? await reportById(user, report_id) : null;
          if(report_id&&!report)throw new HttpError(404,"Report not found.");
          if(report?.prepared)throw new HttpError(409,"Prepared reports cannot trigger provider or crawl work.");
          let brand = cfg?.brandName || cfg?.brandUrl || "";
          let ownedDomains = cfg?.brandDomains ?? [];
          if (!report) {
            const r = await runBenchmark(user, cfg, keys);
            if ("error" in r) return { error: r.error };
            report = r.report;
            brand = r.brand;
            ownedDomains = r.ownedDomains;
          }
          const dx = await diagnoseAndPersist(user, report, brand, ownedDomains);
          return {
            report_id: report.report_id,
            current_citation_share: dx.currentCitationShare,
            gap: dx.gap,
            category_profile: dx.categoryProfile,
            your_profile: dx.yourProfile,
            top_domains: dx.topDomains.slice(0, 10),
            crawl_grounded: dx.crawlGrounded,
            crawled_count: dx.crawled?.filter((c) => c.fetched).length ?? 0,
          };
        },
      }),

      build_plan: tool({
        description:
          "Card 3 (How can I improve? / Plan). Build a costed action plan filling the biggest citation gaps, EXPAND it into a week-by-week roadmap (actions, owner, hours, deliverable, KPI per week), and persist it. Returns a MODELED projection with assumptions + confidence.",
        inputSchema: z.object({
          report_id: z.string().optional(),
          budget_usd: z.number().optional(),
          team_size: z.number().optional(),
          timeline_weeks: z.number().optional(),
        }),
        async execute(input) {
          const cfg = await getActiveConfig();
          let report: FullReport | null = input.report_id ? await reportById(user, input.report_id) : null;
          if(input.report_id&&!report)throw new HttpError(404,"Report not found.");
          if(report?.prepared)throw new HttpError(409,"Prepared reports cannot trigger provider or crawl work.");
          let brand = cfg?.brandName || cfg?.brandUrl || "";
          let ownedDomains = cfg?.brandDomains ?? [];
          let runId: string | null = input.report_id ?? null;
          if (!report) {
            const r = await runBenchmark(user, cfg, keys);
            if ("error" in r) return { error: r.error };
            report = r.report;
            brand = r.brand;
            ownedDomains = r.ownedDomains;
            runId = r.report.report_id;
          }
          const dx = await diagnoseAndPersist(user, report, brand, ownedDomains);

          const budget = input.budget_usd ?? cfg?.budgetUsd ?? 400;
          const team = input.team_size ?? cfg?.teamSize ?? 2;
          const weeks = input.timeline_weeks ?? cfg?.timelineWeeks ?? 8;

          const allocation = allocatePlan({ budgetUsd: budget, teamSize: team, timelineWeeks: weeks, gaps: dx.gap });
          const projection = projectImpact({
            currentCitationShare: dx.currentCitationShare,
            tactics: allocation.tactics,
            timelineWeeks: weeks,
            grounding: { crawl: dx.crawlGrounded },
          });

          // Week-by-week roadmap (manager-shareable detail: WHAT/WHY/HOW/WHO + guidelines).
          // generateRoadmap retries once internally; if it STILL fails we save the plan
          // without a roadmap but tell the user loudly instead of shipping a planless doc.
          let roadmap: RoadmapDoc = { weeks: [], guidelines: [] };
          let roadmapError: string | null = null;
          try {
            roadmap = await generateRoadmap({
              keys,
              brand,
              tactics: allocation.tactics,
              gaps: dx.gap,
              projection,
              timelineWeeks: weeks,
              teamSize: team,
            });
          } catch (e) {
            roadmapError = "The provider did not return a complete roadmap. Any dispatched usage is recorded.";
          }

          const saved = await savePlan({
            userId: user.id,
            configId: cfg?.id ?? null,
            configVersion: cfg?.version ?? null,
            runId,
            tactics: allocation.tactics,
            projection,
            roadmap,
          });

          const capacityNote =
            budget < 100 || team * weeks * 25 < 100
              ? "NOTE: budget/team capacity is very low — only free, low-effort tactics fit. Suggest the user raise budget or team size in Configure for a stronger plan."
              : undefined;

          // Trimmed for chat: the card shows a summary; full WHY/HOW detail lives in
          // the downloadable document (?format=docx|pdf|xlsx|html) — don't re-stream it.
          return {
            plan_id: saved.id,
            report_id: report.report_id,
            budget_usd: budget,
            team_size: team,
            timeline_weeks: weeks,
            person_hours: allocation.personHours,
            spent_usd: allocation.spentUsd,
            spent_hours: allocation.spentHours,
            tactics: allocation.tactics,
            projection,
            roadmap_overview: roadmap.weeks.map((w) => ({
              week: w.week,
              theme: w.theme,
              kpi_checkpoint: w.kpi_checkpoint,
              due_date: isoDate(weekDueDate(saved.createdAt, w.week)),
              action_count: w.actions.length,
            })),
            execution_guidelines: roadmap.guidelines,
            gap: dx.gap,
            capacity_note: capacityNote,
            roadmap_error: roadmapError
              ? `Week-by-week roadmap generation failed (${roadmapError}). The plan document will lack the schedule — offer to rebuild the plan to retry.`
              : undefined,
          };
        },
      }),

      approve_plan: tool({
        description:
          "Approve a plan into the user's Tracker: creates one editable execution item per roadmap action, with due dates derived from the plan's creation date (week N due N×7 days later). Call ONLY after the user explicitly says yes. Defaults to the latest plan.",
        inputSchema: z.object({ plan_id: z.string().optional() }),
        async execute({ plan_id }) {
          const plan = plan_id ? await getPlanById(plan_id) : await getLatestPlan();
          if (!plan) return { error: "No plan found. Build a plan first (How can I improve?)." };
          return {plan_id:plan.id,requires_user_approval:true,message:"Use the plan card's Approve button to add these actions to your tracker."};
        },
      }),

      track_progress: tool({
        description:
          "Card 4 (Track). PRIMARY source = the user's Tracker items (status + remarks they maintain on the Tracker tab). Set re_benchmark: true ONLY when the user wants measured citation-share impact — it re-runs the AI panel and costs money, so ask first.",
        inputSchema: z.object({
          re_benchmark: z
            .boolean()
            .optional()
            .describe("Re-run the AI panel for measured impact (paid). Default false."),
        }),
        async execute({ re_benchmark }) {
          const tracked = await latestTrackedPlanItems();
          const plan = tracked ? await getPlanById(tracked.planId) : await getLatestPlan();

          let measured: { current_citation_share: number } | null = null;
          if (re_benchmark) {
            const cfg = await getActiveConfig();
            const r = await runBenchmark(user, cfg, keys);
            if ("error" in r) return { error: r.error };
            const analysis: AnalysisAnswer[] = r.report.answers.map((a) => ({
              prompt: a.prompt,
              rawAnswer: "",
              citedDomains: a.cited_domains,
              sentiment: a.sentiment,
            }));
            measured = {
              current_citation_share: computeCitations(r.brand, analysis, r.ownedDomains)
                .your_citation_share,
            };
          }

          if (!tracked) {
            return {
              approved: false,
              plan_id: plan?.id ?? null,
              message: plan
                ? "The latest plan hasn't been approved into the Tracker yet — offer to approve it (approve_plan) so progress can be tracked item by item."
                : "No plan yet. Build a plan first (How can I improve?).",
              baseline_citation_share: plan?.projection?.currentCitationShare ?? null,
              target_citation_share: plan?.targetCitationShare ?? null,
              measured,
            };
          }

          const today = isoDate(new Date());
          const counts = { not_started: 0, in_progress: 0, done: 0, blocked: 0 };
          for (const i of tracked.items) counts[i.status] += 1;
          const overdue = tracked.items.filter((i) => i.status !== "done" && i.dueDate < today);
          return {
            approved: true,
            plan_id: tracked.planId,
            total_items: tracked.items.length,
            status_counts: counts,
            done_pct: Math.round((counts.done / Math.max(1, tracked.items.length)) * 100),
            overdue: overdue
              .slice(0, 10)
              .map((i) => ({ week: i.week, action: i.action, due_date: i.dueDate, status: i.status })),
            items: tracked.items.map((i) => ({
              week: i.week,
              action: i.action,
              status: i.status,
              due_date: i.dueDate,
              owner_role: i.ownerRole,
              remarks: i.remarks,
            })),
            baseline_citation_share: plan?.projection?.currentCitationShare ?? null,
            target_citation_share: plan?.targetCitationShare ?? null,
            measured,
          };
        },
      }),

      generate_content: tool({
        description:
          "Write GEO-optimized content for a plan tactic: blog_post, comparison_page, reddit_answer, linkedin_post, guest_post_pitch, review_request_email, youtube_brief. Returns ready-to-edit markdown (placeholders where real data is needed).",
        inputSchema: z.object({
          type: z.enum(CONTENT_TYPES),
          topic: z
            .string()
            .min(3)
            .describe("The assignment, e.g. 'YourBrand vs Competitor comparison' or 'answer: best tool for X'."),
        }),
        async execute({ type, topic }) {
          const cfg = await getActiveConfig();
          const plan = await getLatestPlan();
          if(plan?.prepared)throw new HttpError(409,"Prepared context cannot trigger paid content generation.");
          const planContext = plan
            ? `Active plan targets citation share ${(plan.projection?.currentCitationShare ?? 0) * 100}% → ${(plan.targetCitationShare ?? 0) * 100}%; tactics: ${plan.tactics.map((t) => t.name).join("; ")}`
            : undefined;
          const markdown = await generateContent({
            keys,
            type,
            topic,
            brand: cfg?.brandName || cfg?.brandUrl || "the brand",
            brandUrl: cfg?.brandUrl,
            description: cfg?.description,
            competitors: cfg?.competitors,
            queries: cfg?.queries,
            planContext,
          });
          return { type, topic, markdown };
        },
      }),

      save_memory: tool({
        description:
          "Persist something worth remembering across sessions. kind: 'structural' (durable facts about the brand/market/results), 'procedural' (how this user wants things done — formats, tone, preferences), 'working' (current goals/in-flight work). Use when the user states a preference, a durable fact emerges, or a goal is set.",
        inputSchema: z.object({
          kind: z.enum(["working", "procedural", "structural"]),
          content: z.string().min(5).max(1200),
        }),
        async execute({ kind, content }) {
          await saveMemory(user.id, kind, content);
          return { saved: true, kind };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    generateMessageId:randomUUID,
    originalMessages:messages,
    onError:error=>{incomplete=true;return chatErrorMessage(error);},
    messageMetadata:({part})=>part.type==='finish'?{incomplete}:undefined,
    onFinish:async({messages:finished,isAborted})=>runWithExecution(actor,async()=>{
      // The captured scope still passes the ordinary durable session check. It
      // does not grant persistence after revocation or extend the deadline.
      try{await saveThreadMessages(user.id,threadId,recoverChatMessages(finished,isAborted||incomplete||Boolean(actor.signal?.aborted)));}
      catch(error){console.warn('[chat] thread_persistence_failed',JSON.stringify({operationId:actor.operationId,category:persistenceFailure(error)}));}
      finally{await release();}
    }),
  });
 }catch(error){await release();throw error;}
 });
});
