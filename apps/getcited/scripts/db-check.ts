/** Read-only current database identity/readiness; no implicit env-file loading. */
import {database,query,closeDatabase} from '../src/lib/db/client';
async function main(){try{await database();const result=await query("select current_database() database,current_user role,(select count(*)::int from pg_tables where schemaname='public') tables");console.log(JSON.stringify({status:'ready',...result.rows[0]}));}finally{await closeDatabase();}}
main().catch(()=>{console.error('Database readiness failed.');process.exitCode=1;});
