import {z} from 'zod';
import {requireActor} from '@/lib/server/auth';
import {json,readJson,route,HttpError} from '@/lib/server/http';
import {executionFor,runWithExecution} from '@/lib/server/execution';
import {withCapacity} from '@/lib/server/usage';
import {requireWorkspaceRoom} from '@/lib/server/workspace';
import {resolveKeys} from '@/lib/server/keys';
import {getActiveConfig} from '@/lib/db/configs';
import {PostgresGeoStore} from '@/lib/db/geo-store';
import {InProcessPanelRunner,buildReport} from '@/lib/geo';
import {costCapUsd} from '@/lib/geo/keys';
import {userLimit} from '@/lib/server/security';
const Input=z.object({prompt:z.string().trim().min(3).max(2000),model:z.literal('openai'),maxOutputTokens:z.number().int().min(16).max(600).default(128),keys:z.unknown().optional()}).strict();
export const POST=route(async(req:Request)=>{
 const actor=await requireActor(req,{write:true});await userLimit(actor,'benchmark',20,3600);const p=Input.safeParse(await readJson(req,16384));if(!p.success)throw new HttpError(400,'Choose one supported model and a prompt of up to 2,000 characters.');
 const e={...executionFor(actor),signal:AbortSignal.any([req.signal,AbortSignal.timeout(120000)])};return runWithExecution(e,()=>withCapacity(async()=>{
 const cfg=await getActiveConfig();if(!cfg)throw new HttpError(400,'Save your brand configuration first.');if(cfg.prepared)throw new HttpError(409,'The prepared example is free and read-only. Save a new ordinary configuration to run a live probe.');
 await requireWorkspaceRoom();const keys=await resolveKeys(p.data.keys,cfg.mode),store=new PostgresGeoStore(actor.id,cfg.id);
 const out=await new InProcessPanelRunner(store,{keys,costCapUsd:costCapUsd(),forceMock:e.mode==='mock',parserMode:'deterministic',maxOutputTokens:p.data.maxOutputTokens}).run({brand:cfg.brandName||cfg.brandUrl,brand_domains:cfg.brandDomains,competitors:cfg.competitors,prompts:[p.data.prompt],panel:['openai'],runs:1});
 return json({...out,prepared:false,extraction_method:'deterministic',report:await buildReport(store,out.report_id)});
 }));
});
