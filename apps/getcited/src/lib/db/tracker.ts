import "server-only";
import {and,eq,desc,asc,sql} from "drizzle-orm";
import {drizzleDatabase,schema,ownerId} from "./client";
import {repositoryOwner} from "../auth";
import {HttpError} from "../server/http";
import { trackerRowsFromRoadmap } from "@/lib/geo/schedule";
import type { PlanView } from "@/lib/db/plans";

export const TRACKER_STATUSES = ["not_started", "in_progress", "done", "blocked"] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export function isTrackerStatus(s: string): s is TrackerStatus {
  return (TRACKER_STATUSES as readonly string[]).includes(s);
}

export interface TrackerItemView {
  id: string;
  planId: string;
  week: number;
  dueDate: string; // yyyy-mm-dd
  action: string;
  ownerRole: string | null;
  hours: number | null;
  deliverable: string | null;
  status: TrackerStatus;
  remarks: string | null;
  updatedAt: string;
}


function mapItem(r:typeof schema.trackerItems.$inferSelect):TrackerItemView{return {...r,status:r.status as TrackerStatus,updatedAt:r.updatedAt.toISOString()};}
export async function approvePlanToTracker(userId:string,plan:PlanView):Promise<{created:number;alreadyApproved:boolean}>{
 const owner=await repositoryOwner(userId),db=await drizzleDatabase();return db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId(plan.id)},91094))`);
 const [owned]=await tx.select().from(schema.plans).where(and(eq(schema.plans.userId,owner),eq(schema.plans.id,plan.id)));if(!owned)throw new HttpError(404,'Plan not found.');
 if((await tx.select({id:schema.trackerItems.id}).from(schema.trackerItems).where(and(eq(schema.trackerItems.userId,owner),eq(schema.trackerItems.planId,plan.id))).limit(1)).length)return {created:0,alreadyApproved:true};
 const rows=trackerRowsFromRoadmap(owned.createdAt,owned.roadmap);if(rows.length>200)throw new HttpError(413,'Plan has too many tracker actions.');
 if(rows.length)await tx.insert(schema.trackerItems).values(rows.map(r=>({userId:owner,planId:plan.id,week:r.week,dueDate:r.due_date,action:r.action,ownerRole:r.owner_role,hours:r.hours,deliverable:r.deliverable})));
 return {created:rows.length,alreadyApproved:false};});
}
export async function listTrackerItems(planId:string):Promise<TrackerItemView[]>{const owner=await repositoryOwner(),db=await drizzleDatabase();if(!(await db.select({id:schema.plans.id}).from(schema.plans).where(and(eq(schema.plans.userId,owner),eq(schema.plans.id,ownerId(planId))))).length)throw new HttpError(404,'Plan not found.');return (await db.select().from(schema.trackerItems).where(and(eq(schema.trackerItems.userId,owner),eq(schema.trackerItems.planId,planId))).orderBy(asc(schema.trackerItems.week),asc(schema.trackerItems.dueDate))).map(mapItem);}
export async function latestTrackedPlanItems():Promise<{planId:string;items:TrackerItemView[]}|null>{const owner=await repositoryOwner(),db=await drizzleDatabase();const [row]=await db.select({id:schema.plans.id}).from(schema.plans).innerJoin(schema.trackerItems,and(eq(schema.trackerItems.planId,schema.plans.id),eq(schema.trackerItems.userId,owner))).where(eq(schema.plans.userId,owner)).orderBy(desc(schema.plans.createdAt)).limit(1);return row?{planId:row.id,items:await listTrackerItems(row.id)}:null;}
export async function updateTrackerItem(id:string,patch:{status?:TrackerStatus;remarks?:string}){const owner=await repositoryOwner(),db=await drizzleDatabase();if(patch.status&&!isTrackerStatus(patch.status)||patch.remarks&&patch.remarks.length>2000)throw new HttpError(400,'Invalid tracker update.');const r=await db.update(schema.trackerItems).set({...patch,updatedAt:new Date()}).where(and(eq(schema.trackerItems.userId,owner),eq(schema.trackerItems.id,ownerId(id)))).returning({id:schema.trackerItems.id});if(!r.length)throw new HttpError(404,'Tracker item not found.');}
