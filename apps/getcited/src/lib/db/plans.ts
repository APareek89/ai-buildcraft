import "server-only";
import {and,eq,desc} from "drizzle-orm";
import {drizzleDatabase,schema,ownerId} from "./client";
import {repositoryOwner} from "../auth";
import {HttpError} from "../server/http";
import {getConfigById} from "./configs";
import type { ChosenTactic, Projection } from "@/lib/geo/plan";

export interface SavePlanInput {
  userId: string;
  configId: string | null;
  configVersion: number | null;
  runId: string | null;
  tactics: ChosenTactic[];
  projection: Projection;
  /** Legacy plans store RoadmapWeek[]; current ones store {weeks, guidelines}. */
  roadmap?: unknown | null;
}

export interface PlanView {
  id: string;
  prepared: boolean;
  configId: string | null;
  tactics: ChosenTactic[];
  projection: Projection | null;
  roadmap: unknown | null;
  targetCitationShare: number | null;
  timelineWeeks: number | null;
  confidence: string | null;
  createdAt: string;
}

function mapPlan(r:typeof schema.plans.$inferSelect):PlanView{return {...r,tactics:r.tactics as ChosenTactic[],projection:r.projection as Projection|null,roadmap:r.roadmap??null,createdAt:r.createdAt.toISOString()};}
export async function savePlan(input:SavePlanInput,prepared=false):Promise<PlanView>{const owner=await repositoryOwner(input.userId),db=await drizzleDatabase();if(input.configId&&!await getConfigById(input.configId))throw new HttpError(404,'Configuration not found.');if(input.runId&&!(await db.select({id:schema.runs.id}).from(schema.runs).where(and(eq(schema.runs.userId,owner),eq(schema.runs.id,ownerId(input.runId))))).length)throw new HttpError(404,'Report not found.');if(Buffer.byteLength(JSON.stringify(input))>256*1024)throw new HttpError(413,'Plan is too large.');const [r]=await db.insert(schema.plans).values({userId:owner,configId:input.configId,configVersion:input.configVersion,runId:input.runId,tactics:input.tactics,projection:input.projection as unknown as Record<string,unknown>,roadmap:input.roadmap??null,targetCitationShare:input.projection.targetCitationShare,timelineWeeks:input.projection.timelineWeeks,confidence:input.projection.confidence,prepared}).returning();return mapPlan(r);}
export async function getLatestPlan():Promise<PlanView|null>{const owner=await repositoryOwner(),db=await drizzleDatabase();const [r]=await db.select().from(schema.plans).where(eq(schema.plans.userId,owner)).orderBy(desc(schema.plans.createdAt)).limit(1);return r?mapPlan(r):null;}
export async function getPlanById(id:string):Promise<PlanView|null>{const owner=await repositoryOwner(),db=await drizzleDatabase();const [r]=await db.select().from(schema.plans).where(and(eq(schema.plans.userId,owner),eq(schema.plans.id,ownerId(id)))).limit(1);return r?mapPlan(r):null;}
export async function listPlans(limit=12):Promise<PlanView[]>{const owner=await repositoryOwner(),db=await drizzleDatabase();return (await db.select().from(schema.plans).where(eq(schema.plans.userId,owner)).orderBy(desc(schema.plans.createdAt)).limit(Math.min(100,Math.max(1,limit)))).map(mapPlan);}
