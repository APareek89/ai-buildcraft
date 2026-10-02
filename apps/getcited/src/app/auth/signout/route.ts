import {json} from '@/lib/server/http';
export async function GET(){return json({error:'Use email and password sign-in.'},410);}
export const POST=GET;
