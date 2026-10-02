import "server-only";
import {and,desc,eq,sql} from "drizzle-orm";
import {drizzleDatabase,schema,ownerId} from "./client";
import {repositoryOwner} from "../auth";
import {HttpError} from "../server/http";

/** App-layer view of a config row (camelCase). */
export interface ConfigView {
  id: string;
  prepared: boolean;
  version: number;
  isActive: boolean;
  brandUrl: string;
  brandName: string | null;
  description: string | null;
  brandDomains: string[];
  competitors: string[];
  /** Parallel to competitors: matching domain per competitor ("" when unknown). */
  competitorDomains: string[];
  queries: string[];
  budgetUsd: number;
  teamSize: number;
  timelineWeeks: number;
  mode: string;
  platformOption: string | null;
  instanceUrl: string | null;
  createdAt: string;
}

export interface SaveConfigInput {
  brandUrl: string;
  brandName?: string | null;
  description?: string | null;
  brandDomains: string[];
  competitors: string[];
  competitorDomains: string[];
  queries: string[];
  budgetUsd: number;
  teamSize: number;
  timelineWeeks: number;
  mode: string;
  platformOption?: string | null;
  instanceUrl?: string | null;
}

function mapRow(r:typeof schema.configs.$inferSelect):ConfigView{return {...r,createdAt:r.createdAt.toISOString()};}
export async function getActiveConfig():Promise<ConfigView|null>{const owner=await repositoryOwner(),db=await drizzleDatabase();const [r]=await db.select().from(schema.configs).where(and(eq(schema.configs.userId,owner),eq(schema.configs.isActive,true))).orderBy(desc(schema.configs.version)).limit(1);return r?mapRow(r):null;}
export async function getConfigById(id:string):Promise<ConfigView|null>{const owner=await repositoryOwner(),db=await drizzleDatabase();const [r]=await db.select().from(schema.configs).where(and(eq(schema.configs.userId,owner),eq(schema.configs.id,ownerId(id)))).limit(1);return r?mapRow(r):null;}
export async function listConfigVersions():Promise<ConfigView[]>{const owner=await repositoryOwner(),db=await drizzleDatabase();return (await db.select().from(schema.configs).where(eq(schema.configs.userId,owner)).orderBy(desc(schema.configs.version)).limit(100)).map(mapRow);}
export async function saveConfigVersion(userId:string,input:SaveConfigInput,prepared=false):Promise<ConfigView>{
 const owner=await repositoryOwner(userId),db=await drizzleDatabase();
 if(Buffer.byteLength(JSON.stringify(input))>32768)throw new HttpError(413,'Configuration is too large.');
 return db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${owner},91091))`);
  const prior=await tx.select({version:schema.configs.version}).from(schema.configs).where(eq(schema.configs.userId,owner)).orderBy(desc(schema.configs.version)).limit(1);
  if((prior[0]?.version??0)>=100)throw new HttpError(429,'The workspace configuration limit is reached.');
  const [active]=await tx.select({prepared:schema.configs.prepared}).from(schema.configs).where(and(eq(schema.configs.userId,owner),eq(schema.configs.isActive,true))).limit(1);
  const activate=!prepared||!active||active.prepared;
  if(activate)await tx.update(schema.configs).set({isActive:false}).where(and(eq(schema.configs.userId,owner),eq(schema.configs.isActive,true)));
  const [r]=await tx.insert(schema.configs).values({...input,userId:owner,version:(prior[0]?.version??0)+1,isActive:activate,prepared}).returning();return mapRow(r);
 });
}
export async function updateConfigMode(id:string,mode:string){const owner=await repositoryOwner(),db=await drizzleDatabase();const rows=await db.update(schema.configs).set({mode}).where(and(eq(schema.configs.id,ownerId(id)),eq(schema.configs.userId,owner),eq(schema.configs.prepared,false))).returning({id:schema.configs.id});if(!rows.length)throw new HttpError(409,'Save a new ordinary configuration before changing its mode.');}
