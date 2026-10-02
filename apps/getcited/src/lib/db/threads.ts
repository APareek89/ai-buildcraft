import 'server-only';
import type {UIMessage} from 'ai';
import {and,eq,desc,asc,sql} from 'drizzle-orm';
import {drizzleDatabase,schema,ownerId} from './client';
import {repositoryOwner} from '../auth';
import {HttpError} from '../server/http';
export interface ThreadView{id:string;title:string;createdAt:string;updatedAt:string;prepared:boolean}
function map(r:typeof schema.threads.$inferSelect):ThreadView{return {...r,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()};}
export async function listThreads():Promise<ThreadView[]>{const owner=await repositoryOwner(),db=await drizzleDatabase();return (await db.select().from(schema.threads).where(eq(schema.threads.userId,owner)).orderBy(desc(schema.threads.updatedAt)).limit(50)).map(map);}
export async function getThread(id:string):Promise<ThreadView|null>{const owner=await repositoryOwner(),db=await drizzleDatabase();const [r]=await db.select().from(schema.threads).where(and(eq(schema.threads.userId,owner),eq(schema.threads.id,ownerId(id))));return r?map(r):null;}
export async function createThread(userId:string,title:string,prepared=false):Promise<ThreadView>{const owner=await repositoryOwner(userId),db=await drizzleDatabase();const [r]=await db.insert(schema.threads).values({userId:owner,title:title.slice(0,80),prepared}).returning();return map(r);}
export async function deleteThread(id:string){const owner=await repositoryOwner(),db=await drizzleDatabase();const t=await getThread(id);if(!t)throw new HttpError(404,'Thread not found.');if(t.prepared)throw new HttpError(409,'The prepared example is retained for reuse.');await db.delete(schema.threads).where(and(eq(schema.threads.userId,owner),eq(schema.threads.id,ownerId(id))));}
export async function getThreadMessages(id:string):Promise<UIMessage[]>{const owner=await repositoryOwner(),db=await drizzleDatabase();if(!await getThread(id))throw new HttpError(404,'Thread not found.');return (await db.select().from(schema.threadMessages).where(and(eq(schema.threadMessages.userId,owner),eq(schema.threadMessages.threadId,ownerId(id)))).orderBy(asc(schema.threadMessages.createdAt)).limit(200)).map(r=>({id:r.messageId||r.id,role:r.role,parts:r.parts})) as UIMessage[];}
export async function saveThreadMessages(userId:string,id:string,messages:UIMessage[],allowPrepared=false){
 const owner=await repositoryOwner(userId),db=await drizzleDatabase();
 if(messages.length>200||Buffer.byteLength(JSON.stringify(messages))>256*1024||new Set(messages.map(m=>m.id)).size!==messages.length||messages.some(m=>!['user','assistant','system'].includes(m.role)||typeof m.id!=='string'||m.id.length<1||m.id.length>200||!Array.isArray(m.parts)))throw new HttpError(413,'This thread reached its message limit. Start a new thread.');
 await db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId(id)},91092))`);
  const [t]=await tx.select().from(schema.threads).where(and(eq(schema.threads.userId,owner),eq(schema.threads.id,id)));
  if(!t)throw new HttpError(404,'Thread not found.');if(t.prepared&&!allowPrepared)throw new HttpError(409,'The prepared conversation is read-only.');
  await tx.delete(schema.threadMessages).where(and(eq(schema.threadMessages.userId,owner),eq(schema.threadMessages.threadId,id)));
  if(messages.length)await tx.insert(schema.threadMessages).values(messages.map((m,i)=>({userId:owner,threadId:id,messageId:m.id,role:m.role,parts:m.parts,createdAt:new Date(Date.now()+i)})));
  const first=messages.find(m=>m.role==='user')?.parts.find(p=>p.type==='text');
  await tx.update(schema.threads).set({updatedAt:new Date(),...(t.title==='New thread'&&first?.type==='text'?{title:first.text.slice(0,80)}:{})}).where(and(eq(schema.threads.userId,owner),eq(schema.threads.id,id)));
 });
}
