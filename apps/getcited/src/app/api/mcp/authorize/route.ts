import {getClient,issueCode} from '@/lib/mcp/auth';
import {actorFor} from '@/lib/server/auth';
import {origin,csrfToken,requireCsrf,userLimit} from '@/lib/server/security';
import {HttpError,readBytes,route} from '@/lib/server/http';
function escape(s:string){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
async function parameters(p:URLSearchParams){
 const clientId=p.get('client_id')??'',redirectUri=p.get('redirect_uri')??'',codeChallenge=p.get('code_challenge')??'',state=p.get('state')??'';
 if(p.get('response_type')!=='code'||p.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)||state.length>1000||p.get('resource')&&p.get('resource')!==origin()+'/mcp'||p.get('scope')&&p.get('scope')!=='mcp')throw new HttpError(400,'Invalid OAuth authorization request.');
 const client=await getClient(clientId);if(!client?.redirectUris.includes(redirectUri))throw new HttpError(400,'Redirect URI is not registered.');
 return {client,clientId,redirectUri,codeChallenge,state};
}
export const GET=route(async(req:Request)=>{
 const url=new URL(req.url);if(url.search.length>8192)throw new HttpError(414,'Authorization request is too large.');
 const p=await parameters(url.searchParams),actor=await actorFor(req);
 if(!actor){const target=new URL('/login',origin());target.searchParams.set('next',url.pathname+url.search);return Response.redirect(target,303);}
 const fields={client_id:p.clientId,redirect_uri:p.redirectUri,code_challenge:p.codeChallenge,code_challenge_method:'S256',response_type:'code',scope:'mcp',resource:origin()+'/mcp',state:p.state,csrf:csrfToken(undefined,'session:'+actor.sid)};
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect GetCited</title><body style="font:16px system-ui;max-width:640px;margin:60px auto;padding:24px"><h1>Connect ${escape(p.client.name||'this MCP client')}?</h1><p>This client will be able to read your GetCited workspace, use your configured providers within your usage limits, and change your plans and tracker.</p><p>Account: ${escape(actor.email)}<br>Redirect: ${escape(p.redirectUri)}</p><form method="post">${Object.entries(fields).map(([k,v])=>`<input type="hidden" name="${k}" value="${escape(v)}">`).join('')}<button name="decision" value="approve">Allow access</button> <a href="/connector">Cancel</a></form></body></html>`,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'}});
});
export const POST=route(async(req:Request)=>{
 const actor=await actorFor(req);if(!actor)throw new HttpError(401,'Sign in to continue.');
 const values=new URLSearchParams((await readBytes(req,8192)).toString('utf8')),h=new Headers(req.headers);h.set('x-getcited-csrf',values.get('csrf')??'');requireCsrf(new Request(req.url,{headers:h}),actor);await userLimit(actor,'oauth-consent',10,600);
 if(values.get('decision')!=='approve')throw new HttpError(400,'Access was not approved.');
 const p=await parameters(values),code=await issueCode({clientId:p.clientId,userId:actor.id,sessionId:actor.sid,redirectUri:p.redirectUri,codeChallenge:p.codeChallenge,scopes:['mcp'],resource:origin()+'/mcp'});
 const target=new URL(p.redirectUri);target.searchParams.set('code',code);if(p.state)target.searchParams.set('state',p.state);return Response.redirect(target,303);
});
