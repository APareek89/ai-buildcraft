import "server-only";
import {and,eq} from "drizzle-orm";
import {drizzleDatabase,schema,ownerId} from "../db/client";
import {repositoryOwner} from "../auth";
import {getActiveConfig} from "../db/configs";
import {getLatestPlan,getPlanById,savePlan,type SavePlanInput} from "../db/plans";
import {approvePlanToTracker,listTrackerItems,latestTrackedPlanItems} from "../db/tracker";
import {PostgresGeoStore} from "../db/geo-store";
import {HttpError} from "../server/http";
export async function mcpActiveConfig(userId:string){await repositoryOwner(userId);return getActiveConfig();}
export async function mcpSavePlan(input:SavePlanInput){await repositoryOwner(input.userId);return savePlan(input);}
export async function mcpLatestPlan(userId:string){await repositoryOwner(userId);return getLatestPlan();}
export async function mcpApprovePlan(userId:string,id?:string){await repositoryOwner(userId);const plan=id?await getPlanById(id):await getLatestPlan();if(!plan){if(id)throw new HttpError(404,'Plan not found.');return {error:'Build a plan first.'};}const r=await approvePlanToTracker(userId,plan);return {plan_id:plan.id,created:r.created,already_approved:r.alreadyApproved};}
export async function mcpTrackerItems(userId:string,id?:string){await repositoryOwner(userId);const result=id?{planId:id,items:await listTrackerItems(id)}:await latestTrackedPlanItems();return result?{plan_id:result.planId,items:result.items.map(r=>({week:r.week,due_date:r.dueDate,action:r.action,owner_role:r.ownerRole,hours:r.hours,deliverable:r.deliverable,status:r.status,remarks:r.remarks}))}:null;}
export class McpGeoStore extends PostgresGeoStore {}
export async function persistCitations(
  userId: string,
  runId: string | null,
  results: {
    url: string;
    domain: string;
    sourceType: string;
    title: string | null;
    excerpt: string | null;
    mentionsBrand: boolean;
    mentionsCompetitor: string | null;
    fetched: boolean;
    skippedReason?: string;
  }[],
): Promise<void> {
 const owner=await repositoryOwner(userId),db=await drizzleDatabase();
 if(results.length>30||Buffer.byteLength(JSON.stringify(results))>256*1024)throw new HttpError(413,'Citation evidence is too large.');
 if(runId&&!(await db.select({id:schema.runs.id}).from(schema.runs).where(and(eq(schema.runs.userId,owner),eq(schema.runs.id,ownerId(runId))))).length)throw new HttpError(404,'Report not found.');
 if(results.length)await db.insert(schema.citations).values(results.map(r=>({userId:owner,runId,url:r.url,domain:r.domain,sourceType:r.sourceType,citesCompetitor:r.mentionsCompetitor,mentionsBrand:r.mentionsBrand,title:r.title,excerpt:r.excerpt,signals:{fetched:r.fetched,skippedReason:r.skippedReason??null}})));
}
