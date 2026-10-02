import "server-only";
import {eq,and,desc,asc} from "drizzle-orm";
import {drizzleDatabase,schema} from "./client";
import {repositoryOwner} from "../auth";
import { getActiveConfig, type ConfigView } from "./configs";
import { getLatestPlan, listPlans, type PlanView } from "./plans";
import { PostgresGeoStore } from "./geo-store";
import {
  buildReport,
  computeCitations,
  computeSentiment,
  type ShareOfVoiceEntry,
  type AnalysisAnswer,
} from "@/lib/geo";

export interface DashboardKpis {
  sov: number;
  sovDelta: number | null;
  citationShare: number;
  sentimentScore: number | null;
  hallucinations: number;
}

export interface DashboardData {
  config: ConfigView | null;
  prepared: boolean;
  hasRuns: boolean;
  kpis: DashboardKpis | null;
  leaderboard: ShareOfVoiceEntry[];
  trend: { date: string; sov: number }[];
  plan: PlanView | null;
  plans: PlanView[];
  reports: { id: string; kind: string; format: string; title: string | null; createdAt: string }[];
  lastRunAt: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadDashboard(userId: string): Promise<DashboardData> {
  const owner=await repositoryOwner(userId),db=await drizzleDatabase();
  const config=await getActiveConfig();
  const runs=await db.select().from(schema.runs).where(and(eq(schema.runs.userId,owner),eq(schema.runs.status,'completed'))).orderBy(desc(schema.runs.createdAt)).limit(2);
  const sovRows=await db.select().from(schema.sovHistory).where(eq(schema.sovHistory.userId,owner)).orderBy(asc(schema.sovHistory.date)).limit(60);
  const trend=sovRows.map(r=>({date:r.date,sov:r.sov}));
  const reportRows=await db.select().from(schema.reports).where(eq(schema.reports.userId,owner)).orderBy(desc(schema.reports.createdAt)).limit(6);
  const reports=reportRows.map(r=>({...r,createdAt:r.createdAt.toISOString()}));

  const plan = await getLatestPlan();
  const plans = await listPlans(10);

  let kpis: DashboardKpis | null = null;
  let leaderboard: ShareOfVoiceEntry[] = [];
  let lastRunAt: string | null = null;

  if (runs.length > 0) {
    const store = new PostgresGeoStore(userId);
    const latest = await buildReport(store, runs[0]!.id);
    lastRunAt = runs[0]!.createdAt.toISOString();
    if (latest) {
      leaderboard = [...latest.share_of_voice].sort((a, b) => b.sov - a.sov);
      const analysis: AnalysisAnswer[] = latest.answers.map((a) => ({
        prompt: a.prompt,
        rawAnswer: "",
        citedDomains: a.cited_domains,
        sentiment: a.sentiment,
      }));
      const ownedDomains = config?.brandDomains ?? [];
      const brand = latest.brand;
      const citations = computeCitations(brand, analysis, ownedDomains);
      const sentiment = computeSentiment(brand, analysis);
      const brandSov = leaderboard.find((e) => e.brand === brand)?.sov ?? 0;

      let sovDelta: number | null = null;
      if (runs.length > 1) {
        const prev = await buildReport(store, runs[1]!.id);
        const prevBrandSov = prev?.share_of_voice.find((e) => e.brand === brand)?.sov ?? null;
        if (prevBrandSov != null) sovDelta = brandSov - prevBrandSov;
      }

      kpis = {
        sov: brandSov,
        sovDelta,
        citationShare: citations.your_citation_share,
        sentimentScore: sentiment.sentiment_score,
        hallucinations: 0,
      };
    }
  }

  return {
    config,
    prepared: Boolean(runs[0]?.prepared),
    hasRuns: runs.length > 0,
    kpis,
    leaderboard,
    trend,
    plan,
    plans,
    reports,
    lastRunAt,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
