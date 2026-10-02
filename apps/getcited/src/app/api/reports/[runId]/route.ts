import {requireActor} from '@/lib/server/auth';
import {executionFor,runWithExecution} from '@/lib/server/execution';
import {PostgresGeoStore} from '@/lib/db/geo-store';
import {buildReport} from '@/lib/geo';
import {HttpError,json,route} from '@/lib/server/http';
export const GET=route(async(req:Request,context:{params:Promise<{runId:string}>})=>{const actor=await requireActor(req),{runId}=await context.params;return runWithExecution(executionFor(actor),async()=>{const report=await buildReport(new PostgresGeoStore(actor.id),runId);if(!report)throw new HttpError(404,'Report not found.');return json({report});});});
