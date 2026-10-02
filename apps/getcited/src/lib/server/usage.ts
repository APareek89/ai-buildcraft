import {randomUUID} from 'node:crypto';
import {query,transaction,ownerId} from '../db/client';
import {requireExecution,validateExecution} from './execution';
import {HttpError} from './http';
type Reservation={provider:string;model:string;kind:string;maximumUsd:number;inputBytes:number;maxOutputTokens:number;shared:boolean};
function cap(name:string,fallback:number){const n=Number(process.env[name]??fallback);if(!Number.isFinite(n)||n<=0||n>20)throw new Error('Invalid usage budget.');return n;}
export async function reserve(v:Reservation):Promise<{id:string}>{
 const e=await validateExecution();if(e.mode!=='live')throw new Error('Samples cannot reserve paid usage.');
 if(!/^[a-z0-9_-]{1,40}$/i.test(v.provider)||!/^[-a-zA-Z0-9._:/]{1,160}$/.test(v.model)||!/^[-a-zA-Z0-9._:]{1,80}$/.test(v.kind)||!Number.isFinite(v.maximumUsd)||v.maximumUsd<=0||v.maximumUsd>2||!Number.isInteger(v.inputBytes)||v.inputBytes<1||v.inputBytes>262144||!Number.isInteger(v.maxOutputTokens)||v.maxOutputTokens<1||v.maxOutputTokens>8192||typeof v.shared!=='boolean')throw new HttpError(400,'Provider request exceeds its supported limit.');
 return transaction(async c=>{
  await c.query('select pg_advisory_xact_lock(91091001)');
  await c.query("update getcited_usage set status=case when status='reserved' then 'released' else 'uncertain' end,error_class='attempt_expired',settled_at=now() where status in ('reserved','dispatched') and deadline_at<=now()");
  const t=(await c.query(`select count(*)::int n,coalesce(sum(coalesce(actual_usd,reserved_usd)) filter(where shared and status!='released'),0)::float8 total,coalesce(sum(coalesce(actual_usd,reserved_usd)) filter(where owner_id=$1 and status!='released'),0)::float8 own,count(*) filter(where status in ('reserved','dispatched'))::int active,count(*) filter(where status in ('reserved','dispatched') and owner_id=$1)::int own_active,count(*) filter(where operation_id=$2 and owner_id=$1)::int calls from getcited_usage`,[e.ownerId,e.operationId])).rows[0];
  if(t.n>=100000||t.own+v.maximumUsd>cap('GETCITED_OWNER_BUDGET_USD',.25)||(v.shared&&t.total+v.maximumUsd>cap('GETCITED_SHARED_BUDGET_USD',2)))throw new HttpError(429,'The included usage budget is used. The prepared example remains free.');
  if(t.active>=3||t.own_active>=1||t.calls>=24)throw new HttpError(429,'Provider capacity is busy or this operation reached its call limit.');
  const id=randomUUID();await c.query(`insert into getcited_usage(id,owner_id,session_id,operation_id,kind,provider,model,shared,reserved_usd,input_bytes,max_output_tokens,deadline_at,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'reserved')`,[id,e.ownerId,e.sessionId,e.operationId,v.kind,v.provider,v.model,v.shared,v.maximumUsd,v.inputBytes,v.maxOutputTokens,new Date(e.deadlineMs)]);return {id};
 });
}
export async function markDispatched(id:string){
 const e=requireExecution();const accepted=await transaction(async c=>{
  const r=(await c.query(`select v.status,v.deadline_at>now() attempt_active,s.revoked_at,s.expires_at>now() active,u.disabled from getcited_usage v join getcited_sessions s on s.id=v.session_id and s.owner_id=v.owner_id join getcited_users u on u.id=v.owner_id where v.id=$1 and v.owner_id=$2 and v.session_id=$3 for update of v`,[ownerId(id),e.ownerId,e.sessionId])).rows[0];
  if(!r||r.status!=='reserved')throw new HttpError(409,'This provider attempt is no longer available.');
  const grantOk=!e.grantId||(await c.query('select id from getcited_mcp_grants where id=$1 and owner_id=$2 and revoked_at is null and expires_at>now()',[e.grantId,e.ownerId])).rowCount>0;
  if(!r.attempt_active||r.revoked_at||!r.active||r.disabled||!grantOk||e.deadlineMs<=Date.now()){await c.query("update getcited_usage set status='released',settled_at=now() where id=$1 and owner_id=$2 and status='reserved'",[id,e.ownerId]);return false;}
  await c.query("update getcited_usage set status='dispatched',dispatched_at=now() where id=$1 and owner_id=$2 and status='reserved'",[id,e.ownerId]);return true;
 });if(!accepted)throw new HttpError(401,'Sign in to continue.');
}
export async function settle(id:string,v:{inputTokens:number;outputTokens:number;cachedInputTokens?:number;reasoningTokens?:number;providerModel?:string;actualUsd:number}){
 const e=requireExecution();if(![v.inputTokens,v.outputTokens,v.cachedInputTokens??0,v.reasoningTokens??0].every(n=>Number.isInteger(n)&&n>=0&&n<=1e7)||(v.cachedInputTokens??0)>v.inputTokens||(v.reasoningTokens??0)>v.outputTokens||!Number.isFinite(v.actualUsd)||v.actualUsd<0||v.actualUsd>100){await markUncertain(id,{errorClass:'invalid_usage'});return;}
 await query(`update getcited_usage set status='complete',input_tokens=$3,output_tokens=$4,cached_input_tokens=$5,reasoning_tokens=$6,provider_model=$7,actual_usd=$8,settled_at=now() where id=$1 and owner_id=$2 and status in ('dispatched','uncertain')`,[ownerId(id),e.ownerId,v.inputTokens,v.outputTokens,v.cachedInputTokens??0,v.reasoningTokens??0,v.providerModel&&/^[-A-Za-z0-9._:/]{1,160}$/.test(v.providerModel)?v.providerModel:null,v.actualUsd]);
}
export async function releaseUndispatched(id:string){const e=requireExecution();await query("update getcited_usage set status='released',settled_at=now() where id=$1 and owner_id=$2 and status='reserved'",[ownerId(id),e.ownerId]);}
export async function markUncertain(id:string,v:{errorClass:string}){const e=requireExecution();await query("update getcited_usage set status='uncertain',error_class=$3,settled_at=now() where id=$1 and owner_id=$2 and status='dispatched'",[ownerId(id),e.ownerId,/^[a-z_-]{1,60}$/.test(v.errorClass)?v.errorClass:'provider_failure']);}
export async function acquireCapacity():Promise<()=>Promise<void>>{
 const e=await validateExecution(),id=e.operationId;
 await transaction(async c=>{await c.query('select pg_advisory_xact_lock(91091002)');await c.query('delete from getcited_operations where expires_at<now()');const n=(await c.query('select count(*)::int total,count(*) filter(where owner_id=$1)::int own from getcited_operations',[e.ownerId])).rows[0];if(n.total>=3||n.own>=1)throw new HttpError(429,'Wait for the current operation to finish.');await c.query("insert into getcited_operations(id,owner_id,expires_at) values($1,$2,now()+interval '3 minutes')",[id,e.ownerId]);});
 let released=false;return async()=>{if(!released){released=true;await query('delete from getcited_operations where id=$1 and owner_id=$2',[id,e.ownerId]);}};
}
export async function withCapacity<T>(fn:()=>Promise<T>):Promise<T>{const release=await acquireCapacity();try{return await fn();}finally{await release();}}
