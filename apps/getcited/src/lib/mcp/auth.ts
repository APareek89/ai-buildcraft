import 'server-only';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
import {query,transaction,ownerId} from '../db/client';
import {authSecret,origin} from '../server/security';
import {activeSession} from '../server/auth';
import {HttpError} from '../server/http';
export {publicOrigin} from '../http/origin';
export function tokenTtlSeconds(){return 86400;}
function signingKey(){return createHmac('sha256',authSecret()).update('getcited-mcp-access-v1').digest();}
export interface McpClient{clientId:string;redirectUris:string[];name:string|null}
export function validRedirect(value:unknown){if(typeof value!=='string'||value.length>2048)return false;try{const u=new URL(value);return !u.username&&!u.password&&!u.hash&&(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname));}catch{return false;}}
export async function registerClient(name:string|null,redirectUris:string[]):Promise<McpClient>{
 if(name!==null&&(typeof name!=='string'||name.length>120)||!Array.isArray(redirectUris)||redirectUris.length<1||redirectUris.length>4||!redirectUris.every(validRedirect))throw new HttpError(400,'Invalid OAuth client metadata.');
 return transaction(async c=>{await c.query('select pg_advisory_xact_lock(91091004)');if((await c.query('select count(*)::int n from mcp_oauth_clients')).rows[0].n>=500)throw new HttpError(429,'OAuth registration capacity is reached.');const clientId='mcp_'+randomBytes(18).toString('base64url');await c.query('insert into mcp_oauth_clients(client_id,name,redirect_uris) values($1,$2,$3)',[clientId,name,redirectUris]);return {clientId,name,redirectUris};});
}
export async function getClient(id:string):Promise<McpClient|null>{if(!/^mcp_[A-Za-z0-9_-]{24}$/.test(id))return null;const r=(await query('select client_id,name,redirect_uris from mcp_oauth_clients where client_id=$1',[id])).rows[0];return r?{clientId:r.client_id,name:r.name,redirectUris:r.redirect_uris}:null;}
export async function issueCode(p:{clientId:string;userId:string;sessionId:string;redirectUri:string;codeChallenge:string;scopes:string[];resource?:string}){
 if(!/^[A-Za-z0-9_-]{43}$/.test(p.codeChallenge)||p.resource&&p.resource!==origin()+'/mcp'||p.scopes.some(s=>s!=='mcp'))throw new HttpError(400,'Invalid OAuth authorization request.');
 if(!await activeSession(p.userId,p.sessionId))throw new HttpError(401,'Sign in to continue.');
 const client=await getClient(p.clientId);if(!client?.redirectUris.includes(p.redirectUri))throw new HttpError(400,'Redirect URI is not registered.');
 const code=randomBytes(32).toString('base64url');await transaction(async c=>{await c.query('delete from mcp_oauth_codes where expires_at<now()');if((await c.query('select count(*)::int n from mcp_oauth_codes where user_id=$1',[p.userId])).rows[0].n>=20)throw new HttpError(429,'Too many pending authorizations.');await c.query("insert into mcp_oauth_codes(code,client_id,user_id,session_id,redirect_uri,code_challenge,scopes,resource,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '5 minutes')",[createHash('sha256').update(code).digest('hex'),p.clientId,p.userId,p.sessionId,p.redirectUri,p.codeChallenge,['mcp'],origin()+'/mcp']);});return code;
}
export async function consumeCode(code:string,clientId:string,verifier:string,redirectUri:string){
 if(!/^[A-Za-z0-9_-]{43}$/.test(code)||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!validRedirect(redirectUri))throw new HttpError(400,'invalid_grant');
 return transaction(async c=>{
 const hash=createHash('sha256').update(code).digest('hex');const e=(await c.query('select * from mcp_oauth_codes where code=$1 for update',[hash])).rows[0];
 const expected=createHash('sha256').update(verifier).digest('base64url');
 if(!e||e.client_id!==clientId||e.redirect_uri!==redirectUri||new Date(e.expires_at).getTime()<=Date.now()||typeof e.code_challenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(e.code_challenge)||!timingSafeEqual(Buffer.from(expected),Buffer.from(e.code_challenge)))throw new HttpError(400,'invalid_grant');
 const actor=(await c.query('select s.id from getcited_sessions s join getcited_users u on u.id=s.owner_id where s.id=$1 and s.owner_id=$2 and s.revoked_at is null and s.expires_at>now() and not u.disabled',[e.session_id,e.user_id])).rows[0];if(!actor)throw new HttpError(400,'invalid_grant');
 await c.query('delete from mcp_oauth_codes where code=$1',[hash]);const grantId=randomUUID();await c.query("insert into getcited_mcp_grants(id,owner_id,session_id,client_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')",[grantId,e.user_id,e.session_id,e.client_id]);return {userId:e.user_id,sessionId:e.session_id,grantId,clientId:e.client_id,scopes:['mcp'],resource:origin()+'/mcp'};
 });
}
export async function signAccessToken(p:{userId:string;sessionId:string;grantId:string;clientId:string;scopes:string[]}){return new SignJWT({client_id:p.clientId,sid:p.sessionId,scope:'mcp'}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject(ownerId(p.userId)).setJti(ownerId(p.grantId)).setIssuer(origin()).setAudience(origin()+'/mcp').setIssuedAt().setExpirationTime(tokenTtlSeconds()+'s').sign(signingKey());}
export async function verifyMcpToken(token:string,_issuer?:string){
 if(token.length>4096)throw new HttpError(401,'Invalid access token.');
 const {payload}=await jwtVerify(token,signingKey(),{issuer:origin(),audience:origin()+'/mcp',algorithms:['HS256']});
 const userId=ownerId(payload.sub),sessionId=ownerId(payload.sid),grantId=ownerId(payload.jti);
 if(payload.scope!=='mcp'||typeof payload.client_id!=='string'||!await activeSession(userId,sessionId))throw new HttpError(401,'Reconnect your MCP account.');
 if(!(await query('select id from getcited_mcp_grants where id=$1 and owner_id=$2 and session_id=$3 and client_id=$4 and revoked_at is null and expires_at>now()',[grantId,userId,sessionId,payload.client_id])).rowCount)throw new HttpError(401,'Reconnect your MCP account.');
 return {token,userId,sessionId,grantId,clientId:payload.client_id,scopes:['mcp'],expiresAt:payload.exp};
}
export function authorizationServerMetadata(base:string){return {issuer:base,authorization_endpoint:base+'/api/mcp/authorize',token_endpoint:base+'/api/mcp/token',registration_endpoint:base+'/api/mcp/register',response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['mcp']};}
