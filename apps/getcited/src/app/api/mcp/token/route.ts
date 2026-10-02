import {consumeCode,signAccessToken,tokenTtlSeconds} from '@/lib/mcp/auth';
import {readBytes,readJson,json,route,HttpError} from '@/lib/server/http';
import {limit,peer} from '@/lib/server/security';
export const POST=route(async(req:Request)=>{
 await limit('oauth-token:'+peer(req),30,600);
 const isJson=(req.headers.get('content-type')??'').startsWith('application/json');
 const p=isJson?new URLSearchParams(await readJson(req,8192)):new URLSearchParams((await readBytes(req,8192)).toString('utf8'));
 if(p.get('grant_type')!=='authorization_code')throw new HttpError(400,'unsupported_grant_type');
 const grant=await consumeCode(p.get('code')??'',p.get('client_id')??'',p.get('code_verifier')??'',p.get('redirect_uri')??'');
 return json({access_token:await signAccessToken(grant),token_type:'bearer',expires_in:tokenTtlSeconds(),scope:'mcp'});
});
