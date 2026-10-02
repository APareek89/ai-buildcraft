import {requireActor} from '@/lib/server/auth';
import {json,readJson,route,text} from '@/lib/server/http';
import {executionFor,runWithExecution} from '@/lib/server/execution';
import {listThreads,createThread} from '@/lib/db/threads';
import {userLimit} from '@/lib/server/security';
export const GET=route(async(req:Request)=>{const actor=await requireActor(req);return runWithExecution(executionFor(actor),async()=>json({threads:await listThreads()}));});
export const POST=route(async(req:Request)=>{const actor=await requireActor(req,{write:true});await userLimit(actor,'thread-create',20,3600);const body=await readJson(req,4096);return runWithExecution(executionFor(actor),async()=>json({thread:await createThread(actor.id,text(body.title??'New thread','Title',80))},201));});
