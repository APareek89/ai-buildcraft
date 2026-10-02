import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {ownerId,query} from '../db/client';
import {HttpError} from './http';
export type Execution=Readonly<{ownerId:string;sessionId:string;operationId:string;mode:'live'|'mock'|'prepared';deadlineMs:number;signal?:AbortSignal;grantId?:string}>;
const context=new AsyncLocalStorage<Execution>();
export function runWithExecution<T>(actor:Execution,fn:()=>T):T{ownerId(actor.ownerId);ownerId(actor.sessionId);ownerId(actor.operationId);return context.run(Object.freeze({...actor}),fn);}
export function requireExecution(){const actor=context.getStore();if(!actor)throw new HttpError(401,'Sign in to continue.');return actor;}
export function currentExecution(){return context.getStore();}
export function isPrepared(){return requireExecution().mode==='prepared';}
export function executionFor(actor:{id:string;sid:string},mode?:Execution['mode']):Execution{return {ownerId:actor.id,sessionId:actor.sid,operationId:randomUUID(),mode:mode??(process.env.GETCITED_MOCK_MODE==='1'?'mock':'live'),deadlineMs:Date.now()+120000};}
export async function validateExecution(){
 const e=requireExecution();
 if(Date.now()>=e.deadlineMs)throw new HttpError(408,'This operation timed out.');
 const r=await query(`select s.id from getcited_sessions s join getcited_users u on u.id=s.owner_id where s.id=$1 and s.owner_id=$2 and s.revoked_at is null and s.expires_at>now() and not u.disabled`,[e.sessionId,e.ownerId]);
 if(!r.rowCount)throw new HttpError(401,'Sign in to continue.');
 if(e.grantId&&!(await query('select id from getcited_mcp_grants where id=$1 and owner_id=$2 and session_id=$3 and revoked_at is null and expires_at>now()',[e.grantId,e.ownerId,e.sessionId])).rowCount)throw new HttpError(401,'Reconnect your MCP account.');
 return e;
}
