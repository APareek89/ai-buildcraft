import dns from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { requireExecution } from '@/lib/server/execution';

export function isPublicAddress(value:string):boolean {
 const kind=net.isIP(value);if(kind===6){const s=value.toLowerCase();return /^[23][0-9a-f]{0,3}:/.test(s)&&!s.startsWith('2001:db8:')&&!s.startsWith('2001:0:')&&!s.startsWith('2002:');}
 if(kind!==4)return false;const [a,b,c]=value.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export function publicUrl(raw:string):URL {
 const u=new URL(raw);if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.href.length>2048||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local'))throw Error('Only public HTTPS URLs are supported');
 if(net.isIP(u.hostname.replace(/^\[|\]$/g,''))&&!isPublicAddress(u.hostname.replace(/^\[|\]$/g,'')))throw Error('Private destination denied');return u;
}
function boundedLookup(host:string,deadline:number,signal?:AbortSignal) {
 return new Promise<LookupAddress[]>((resolve,reject)=>{
  if(signal?.aborted||deadline<=Date.now()){reject(Error('Public fetch cancelled or expired'));return;}
  const finish=(error?:Error,value?:LookupAddress[])=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value!);};
  const abort=()=>finish(Error('Public fetch cancelled'));
  const timer=setTimeout(()=>finish(Error('Public DNS deadline exceeded')),deadline-Date.now());
  signal?.addEventListener('abort',abort,{once:true});
  dns.lookup(host,{all:true,verbatim:true}).then(value=>finish(undefined,value),()=>finish(Error('Public DNS lookup failed')));
 });
}
type Result={status:number;headers:Record<string,string|string[]|undefined>;text:string};
async function once(u:URL,deadline:number,maxBytes:number,headers:Record<string,string>,signal?:AbortSignal):Promise<Result> {
 const host=u.hostname.replace(/^\[|\]$/g,'');
 const answers=await boundedLookup(host,deadline,signal);
 if(!answers.length||answers.some(a=>!isPublicAddress(a.address)))throw Error('Private DNS destination denied');
 const chosen=answers[0];const left=deadline-Date.now();if(left<1||signal?.aborted)throw Error('Fetch cancelled or expired');
 return new Promise<Result>((resolve,reject)=>{
  let finished=false;let response:IncomingMessage|undefined;let decodedStream:Readable|undefined;
  const finish=(error?:Error,value?:Result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){response?.destroy();decodedStream?.destroy();req.destroy();reject(error);}else resolve(value!);};
  const abort=()=>finish(Error('Public fetch cancelled'));
  const req=https.request(u,{method:'GET',headers:{...headers,'accept-encoding':'gzip, br','user-agent':'GetCitedBot/1.0'},lookup:((_hostname:unknown,options:unknown,cb:unknown)=>{const callback=cb as (...args:unknown[])=>void;if((options as {all?:boolean})?.all)callback(null,[chosen]);else callback(null,chosen.address,chosen.family);}) as never},res=>{
   response=res;
   if((res.statusCode||0)>=300&&(res.statusCode||0)<400){
    // Only Location is needed. Never drain an unbounded redirect body in the background.
    const result={status:res.statusCode!,headers:res.headers,text:''};res.destroy();req.destroy();finish(undefined,result);return;
   }
   const enc=String(res.headers['content-encoding']||'identity').toLowerCase();
   const stream=enc==='gzip'?res.pipe(createGunzip()):enc==='deflate'?res.pipe(createInflate()):enc==='br'?res.pipe(createBrotliDecompress()):enc==='identity'?res:null;
   if(!stream){finish(Error('Unsupported response encoding'));return;}decodedStream=stream;
   const chunks:Buffer[]=[];let raw=0,decoded=0;
   res.on('data',chunk=>{raw+=chunk.length;if(raw>maxBytes)finish(Error('Compressed response exceeds limit'));});
   res.on('error',()=>finish(Error('Public fetch interrupted')));
   stream.on('data',chunk=>{decoded+=chunk.length;if(decoded>maxBytes)finish(Error('Decoded response exceeds limit'));else chunks.push(Buffer.from(chunk));});
   stream.on('error',()=>finish(Error('Public fetch decoding failed')));
   stream.on('end',()=>finish(undefined,{status:res.statusCode||0,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
  });
  const timer=setTimeout(()=>finish(Error('Public fetch deadline exceeded')),left);
  signal?.addEventListener('abort',abort,{once:true});
  req.on('error',()=>finish(Error('Public fetch failed')));
  if(signal?.aborted)abort();else req.end();
 });
}
/** Resolve every redirect, validate every answer, and pin it at the actual TLS connect. */
export async function safePublicGet(raw:string,options:{timeoutMs?:number;maxBytes?:number;headers?:Record<string,string>}={}) {
 const ctx=requireExecution();if(ctx.mode!=='live')throw Error('Prepared work cannot fetch websites');
 const deadline=Math.min(ctx.deadlineMs,Date.now()+Math.min(options.timeoutMs||8000,15_000));let u=publicUrl(raw);
 for(let i=0;i<=3;i++){
  if(deadline<=Date.now()||ctx.signal?.aborted)throw Error('Public fetch cancelled or expired');
  const result=await once(u,deadline,Math.min(options.maxBytes||1_048_576,2_097_152),options.headers||{},ctx.signal);
  if(result.status>=300&&result.status<400){const location=result.headers.location;if(typeof location!=='string')throw Error('Invalid redirect');u=publicUrl(new URL(location,u).href);continue;}
  return {...result,url:u.href,ok:result.status>=200&&result.status<300};
 }
 throw Error('Too many public redirects');
}
