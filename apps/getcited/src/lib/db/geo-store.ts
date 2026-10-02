import 'server-only';
import {and,eq,asc} from 'drizzle-orm';
import {drizzleDatabase,schema,ownerId} from './client';
import {repositoryOwner} from '../auth';
import {currentExecution} from '../server/execution';
import {HttpError} from '../server/http';
import type {GeoStore,BeginRunParams,BeginRunResult,FinishRunParams,StoredReport} from '../geo/store';
import {getConfigById} from './configs';
export class PostgresGeoStore implements GeoStore{
 constructor(private readonly userId:string,private readonly configId:string|null=null){}
 async beginRun(p:BeginRunParams):Promise<BeginRunResult>{const owner=await repositoryOwner(this.userId),db=await drizzleDatabase(),cfg=p.configId??this.configId;if(cfg&&!await getConfigById(cfg))throw new HttpError(404,'Configuration not found.');const [r]=await db.insert(schema.runs).values({userId:owner,configId:cfg,brand:p.brand,brandDomains:p.brandDomains,competitors:p.competitors,panel:p.panel,status:'running',prepared:currentExecution()?.mode==='prepared'}).returning({id:schema.runs.id});return {runId:r.id};}
 async finishRun(id:string,p:FinishRunParams){const owner=await repositoryOwner(this.userId),db=await drizzleDatabase();if(p.answers.length>240||Buffer.byteLength(JSON.stringify(p))>512*1024)throw new HttpError(413,'Report is too large.');await db.transaction(async tx=>{
 const [r]=await tx.select().from(schema.runs).where(and(eq(schema.runs.userId,owner),eq(schema.runs.id,ownerId(id)))).for('update');if(!r)throw new HttpError(404,'Report not found.');if(r.status==='completed')return;if(r.status!=='running')throw new HttpError(409,'This run is not active.');
 if(p.answers.length)await tx.insert(schema.answers).values(p.answers.map(a=>({userId:owner,runId:id,model:a.model,prompt:a.prompt,rawAnswer:a.rawAnswer,mentions:a.mentions,citedDomains:a.citedDomains,sentiment:a.sentiment})));
 await tx.update(schema.runs).set({status:'completed',costUsd:p.costUsd,completedAt:new Date()}).where(and(eq(schema.runs.userId,owner),eq(schema.runs.id,id)));
 await tx.insert(schema.sovHistory).values({userId:owner,configId:r.configId,runId:id,date:p.date,sov:p.sov,sentimentScore:p.sentimentScore});
 });}
 async failRun(id:string,_error:string){const owner=await repositoryOwner(this.userId),db=await drizzleDatabase();await db.update(schema.runs).set({status:'failed',error:'The benchmark did not complete. Any dispatched usage is retained in the usage ledger.',completedAt:new Date()}).where(and(eq(schema.runs.userId,owner),eq(schema.runs.id,ownerId(id)),eq(schema.runs.status,'running')));}
 async getReport(id:string):Promise<StoredReport|null>{const owner=await repositoryOwner(this.userId),db=await drizzleDatabase();const [r]=await db.select().from(schema.runs).where(and(eq(schema.runs.userId,owner),eq(schema.runs.id,ownerId(id))));if(!r)return null;const answers=await db.select().from(schema.answers).where(and(eq(schema.answers.userId,owner),eq(schema.answers.runId,id))).orderBy(asc(schema.answers.createdAt));return {run:{id:r.id,prepared:r.prepared,status:r.status,panel:r.panel,costUsd:r.costUsd,error:r.error,createdAt:r.createdAt.toISOString(),completedAt:r.completedAt?.toISOString()??null},brand:r.brand,competitors:r.competitors,brandDomains:r.brandDomains,answers:answers.map(a=>({model:a.model,prompt:a.prompt,rawAnswer:a.rawAnswer,mentions:a.mentions,citedDomains:a.citedDomains,sentiment:a.sentiment as StoredReport['answers'][number]['sentiment']}))};}
}
