import {query} from '@/lib/db/client';
import {authSecret,origin} from '@/lib/server/security';
import {json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(){try{authSecret();origin();await query('select 1');return json({ok:true,auth:true,mock:process.env.GETCITED_MOCK_MODE==='1'});}catch{return json({ok:false},503);}}
