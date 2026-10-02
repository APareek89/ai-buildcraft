import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { localPreview } from '../server/runtime';
import { HttpError } from '../server/http';
// Business repositories always specify their owner; this pool only uses a DML role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Client = {query<T extends Row = Row>(sql:string, values?:unknown[]):Promise<{rows:T[];rowCount:number}>};
let pool: ReturnType<typeof postgres>|undefined;
let starting: Promise<ReturnType<typeof postgres>>|undefined;
export function ownerId(value:unknown):string {
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new HttpError(400,'Invalid resource identifier.');
 return value.toLowerCase();
}
async function initialize(){
 if(!process.env.DATABASE_URL||!process.env.DATABASE_NAME)throw new Error('Database configuration is required.');
 if(['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].some(k=>process.env[k]))throw new Error('Legacy database configuration is not supported.');
 const url=new URL(process.env.DATABASE_URL),preview=localPreview();
 let ssl:false|{rejectUnauthorized:true;ca:string};
 if(process.env.DATABASE_SSL==='disable'){
  if((process.env.NODE_ENV==='production'&&!preview)||!['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname))throw new Error('Verified database TLS is required.');
  ssl=false;
 }else{
  if(!process.env.DATABASE_SSL_CA_FILE)throw new Error('Database CA is required.');
  ssl={rejectUnauthorized:true,ca:await readFile(process.env.DATABASE_SSL_CA_FILE,'utf8')};
 }
 for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('ssl'))url.searchParams.delete(key);
 const candidate=postgres(url.toString(),{ssl,max:6,prepare:false,connect_timeout:8,idle_timeout:30,connection:{statement_timeout:10000}});
 try{
  const [r]=await candidate`select current_database() db,r.rolsuper,r.rolbypassrls,has_schema_privilege(current_user,'public','CREATE') can_create,has_database_privilege(current_user,current_database(),'TEMP') can_temp from pg_roles r where rolname=current_user`;
  if(r.db!==process.env.DATABASE_NAME||r.rolsuper||r.rolbypassrls||r.can_create||r.can_temp)throw new Error('Unsafe database identity.');
  if(!(await candidate`select version from getcited_portfolio_schema where version=1`).length)throw new Error('Database migration is required.');
  const unsafe=await candidate`select count(*)::int n from pg_tables where schemaname='public' and (tableowner=current_user or has_table_privilege(current_user,quote_ident(schemaname)||'.'||quote_ident(tablename),'TRUNCATE'))`;
  if(unsafe[0].n)throw new Error('Runtime database role must be DML-only.');
  pool=candidate;return candidate;
 }catch(e){await candidate.end();throw e;}
}
export async function database(){if(!starting)starting=initialize().catch(e=>{starting=undefined;throw e;});return starting;}
function adapter(sql:postgres.Sql|postgres.TransactionSql):Client {
 return {async query<T extends Row=Row>(text:string,values:unknown[]=[]){const rows=await sql.unsafe(text,values.map(value=>value instanceof Date?value.toISOString():value) as postgres.ParameterOrJSON<never>[]);return {rows:Array.from(rows) as unknown as T[],rowCount:rows.count};}};
}
export async function query<T extends Row=Row>(text:string,values:unknown[]=[]){return adapter(await database()).query<T>(text,values);}
export async function transaction<T>(fn:(client:Client)=>Promise<T>):Promise<T>{return await (await database()).begin(async sql=>fn(adapter(sql))) as T;}
export async function closeDatabase(){const p=pool;pool=undefined;starting=undefined;await p?.end();}
export async function drizzleDatabase(){return drizzle(await database(),{schema});}
export {schema};
