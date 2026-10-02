import {requireActor} from '@/lib/server/auth';
import {executionFor,runWithExecution} from '@/lib/server/execution';
import {createExample,EXAMPLES} from '@/lib/server/examples';
import {json,readJson,route,HttpError} from '@/lib/server/http';
import {userLimit} from '@/lib/server/security';
export const GET=route(async(req:Request)=>{await requireActor(req);return json({examples:EXAMPLES});});
export const POST=route(async(req:Request)=>{const actor=await requireActor(req,{write:true});await userLimit(actor,'example',20,3600);const body=await readJson(req,1024);if(body.id!=='team-tools'||Object.keys(body).some(k=>k!=='id'))throw new HttpError(400,'Choose the canonical team-tools example.');return runWithExecution(executionFor(actor,'prepared'),async()=>json(await createExample()));});
