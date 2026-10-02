import {query} from '../db/client';
import {validateExecution} from './execution';
import {HttpError} from './http';
/** Reject near-capacity paid work before transport; row triggers enforce all writes. */
export async function requireWorkspaceRoom(){const e=await validateExecution();const rows=(await query('select scope,bytes,rows from getcited_storage_totals where scope in ($1,$2)',['global',e.ownerId])).rows;for(const r of rows){const cap=r.scope==='global'?268435456:8388608;if(Number(r.bytes)>cap-1048576)throw new HttpError(429,'Workspace storage is nearly full. Export your work before starting another operation.');}}
