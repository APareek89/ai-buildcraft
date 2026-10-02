import {registerClient} from '@/lib/mcp/auth';
import {readJson,json,route} from '@/lib/server/http';
import {limit,peer} from '@/lib/server/security';
export const POST=route(async(req:Request)=>{await limit('oauth-register:'+peer(req),10,3600);const b=await readJson(req,8192);const client=await registerClient(b.client_name??null,b.redirect_uris);return json({client_id:client.clientId,client_id_issued_at:Math.floor(Date.now()/1000),redirect_uris:client.redirectUris,token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']},201);});
