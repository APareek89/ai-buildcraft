import "server-only";
import {and,eq,desc,sql} from "drizzle-orm";
import {drizzleDatabase,schema} from "./client";
import {repositoryOwner} from "../auth";
import {HttpError} from "../server/http";
export type MemoryKind="working"|"procedural"|"structural";
export interface MemoryView{id:string;kind:MemoryKind;content:string;updatedAt:string}
export async function listMemories():Promise<MemoryView[]>{const owner=await repositoryOwner(),db=await drizzleDatabase();return (await db.select().from(schema.memories).where(eq(schema.memories.userId,owner)).orderBy(desc(schema.memories.updatedAt)).limit(60)).map(r=>({id:r.id,kind:r.kind as MemoryKind,content:r.content,updatedAt:r.updatedAt.toISOString()}));}
export async function saveMemory(userId:string,kind:MemoryKind,content:string){const owner=await repositoryOwner(userId),db=await drizzleDatabase();if(!['working','procedural','structural'].includes(kind)||typeof content!=='string'||content.length>1500)throw new HttpError(400,'Invalid memory.');await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${owner},91093))`);const rows=await tx.select({id:schema.memories.id}).from(schema.memories).where(and(eq(schema.memories.userId,owner),eq(schema.memories.kind,kind))).orderBy(desc(schema.memories.updatedAt));if(rows.length>=10)await tx.delete(schema.memories).where(and(eq(schema.memories.userId,owner),eq(schema.memories.id,rows[rows.length-1].id)));await tx.insert(schema.memories).values({userId:owner,kind,content,source:'agent'});});}
/** Compact memory block injected into the agent's system prompt. */
export function memoryPromptBlock(memories: MemoryView[]): string {
  if (memories.length === 0) return "";
  const byKind = (k: MemoryKind) => memories.filter((m) => m.kind === k).map((m) => `- ${m.content}`);
  const sections: string[] = [];
  const structural = byKind("structural");
  const procedural = byKind("procedural");
  const working = byKind("working");
  if (structural.length) sections.push(`Structural (facts about the brand/market):\n${structural.join("\n")}`);
  if (procedural.length) sections.push(`Procedural (how this user likes things done):\n${procedural.join("\n")}`);
  if (working.length) sections.push(`Working (current goals/threads of work):\n${working.join("\n")}`);
  return `\n\n## Memory (persisted across sessions — use it, keep it fresh via save_memory)\n${sections.join("\n\n")}`;
}
