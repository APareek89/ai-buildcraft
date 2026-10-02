import {desc,eq,and} from 'drizzle-orm';
import {drizzleDatabase,schema} from '@/lib/db/client';
import {requireActor} from '@/lib/server/auth';
import {executionFor,runWithExecution} from '@/lib/server/execution';
import {PostgresGeoStore} from '@/lib/db/geo-store';
import {buildReport} from '@/lib/geo';
import {json,route} from '@/lib/server/http';
export const GET=route(async(req:Request)=>{const actor=await requireActor(req);return runWithExecution(executionFor(actor),async()=>{const db=await drizzleDatabase();const [run]=await db.select({id:schema.runs.id}).from(schema.runs).where(and(eq(schema.runs.userId,actor.id),eq(schema.runs.status,'completed'))).orderBy(desc(schema.runs.createdAt)).limit(1);const report=run?await buildReport(new PostgresGeoStore(actor.id),run.id):null;return json({report,prepared:report?.prepared??false,extraction_method:'deterministic'});});});
