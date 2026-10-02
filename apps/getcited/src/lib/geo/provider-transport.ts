import { requireExecution } from "@/lib/server/execution";
import { reserve, markDispatched, settle, releaseUndispatched, markUncertain } from "@/lib/server/usage";

export const MAX_PROVIDER_BYTES = 2 * 1024 * 1024;
export const MAX_INPUT_BYTES = 128_000;
export const MAX_OUTPUT_TOKENS = 4096;
export const VERIFIED_PRICES: Record<string, { input: number; output: number; cached: number }> = {
  "gemini-2.5-flash-lite": {input:.10,output:.40,cached:.01},
  "gpt-4o-mini": { input: .15, output: .60, cached: .075 },
  "gpt-4o": { input: 2.5, output: 10, cached: 1.25 },
  "claude-haiku-4-5": { input: 1, output: 5, cached: .1 },
  "claude-sonnet-4-6": { input: 3, output: 15, cached: .3 },
};
const ORIGINS: Record<string, string> = { openai: "https://api.openai.com", google:"https://generativelanguage.googleapis.com", anthropic: "https://api.anthropic.com" };
export function providerCost(model: string, usage: {inputTokens:number;outputTokens:number;cachedInputTokens?:number}) {
 const p=VERIFIED_PRICES[model]; if(!p) throw Error("This model has no verified hosted price");
 const cached=Math.min(usage.inputTokens,usage.cachedInputTokens||0);
 return ((usage.inputTokens-cached)*p.input+cached*p.cached+usage.outputTokens*p.output)/1e6;
}
function number(v:unknown):number|undefined {return Number.isSafeInteger(v) && Number(v)>=0 ? Number(v):undefined;}
type Wire = Record<string, unknown>;
function record(v:unknown):Wire {return v && typeof v==='object' && !Array.isArray(v)?v as Wire:{};}
export function responseUsage(bytes:Uint8Array, contentType:string, provider:string) {
 const text=new TextDecoder().decode(bytes);const records:Wire[]=[];
 if(contentType.includes('text/event-stream')) {
  for(const block of text.split(/\r?\n\r?\n/)) {const lines=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim());if(!lines.length)continue;const s=lines.join('\n');if(s==='[DONE]')continue;try{records.push(record(JSON.parse(s)));}catch{/* incomplete or non-JSON event has no trusted usage */}}
 } else {try{records.push(record(JSON.parse(text)));}catch{return null;}}
 let input:number|undefined,output:number|undefined,cached=0,reasoning=0,model:string|undefined;
 for(const r of records){const msg=record(r.message);const u=record(r.usage || msg.usage);const returned=r.model||msg.model||r.modelVersion;if(typeof returned==='string' && /^[a-zA-Z0-9._:/-]{1,128}$/.test(returned))model=returned;
  if(provider==='google'){const g=record(r.usageMetadata);input=number(g.promptTokenCount)??input;const candidates=number(g.candidatesTokenCount);reasoning=number(g.thoughtsTokenCount)??reasoning;if(candidates!==undefined)output=candidates+reasoning;cached=number(g.cachedContentTokenCount)??cached;}
  else if(provider==='anthropic') {const i=number(u.input_tokens);if(i!==undefined)input=i;const o=number(u.output_tokens);if(o!==undefined)output=o;cached=number(u.cache_read_input_tokens)??cached;const writes=number(u.cache_creation_input_tokens)||0;if(writes)throw Error('Unexpected provider cache write');}
  else {input=number(u.prompt_tokens)??input;output=number(u.completion_tokens)??output;cached=number(record(u.prompt_tokens_details).cached_tokens)??cached;reasoning=number(record(u.completion_tokens_details).reasoning_tokens)??reasoning;}
 }
 if(input===undefined||output===undefined)return null;
 // Anthropic input_tokens excludes cache reads; ledger stores total input.
 return {inputTokens:input+(provider==='anthropic'?cached:0),outputTokens:output,cachedInputTokens:cached,reasoningTokens:reasoning,providerModel:model};
}
function textOnly(body:Wire) {
 const contentOnly=(content:unknown):void=>{
  if(typeof content==='string'||content===null)return;
  if(!Array.isArray(content))throw Error('Unsupported message content');
  for(const item of content){const part=record(item);if(part.type==='text'){if(typeof part.text!=='string')throw Error('Invalid text');}
   else if(part.type==='tool_result')contentOnly(part.content);
   else if(part.type!=='tool_use')throw Error('Only text and function messages are supported');
   if(part.cache_control)throw Error('Provider cache writes are disabled');
  }
 };
 const messages=body.messages;if(!Array.isArray(messages)||!messages.length||messages.length>80)throw Error('Provider message bound exceeded');
 for(const message of messages)contentOnly(record(message).content);
 if(body.cache_control||body.files||body.images)throw Error('Only text requests are supported');
}
/** Each generation is one bounded dispatch, metered before SDK semantic parsing. */
export function meteredFetch(spec:{provider:'openai'|'anthropic'|'google';model:string;shared:boolean;kind?:string}):typeof fetch {
 return async (input,init)=>{
  const ctx=requireExecution();if(ctx.mode!=='live')throw Error('Prepared and mock work cannot use provider transport');
  const price=VERIFIED_PRICES[spec.model];if(!price)throw Error('This model is unavailable: verified price required');
  const req=new Request(input,init);const url=new URL(req.url);
  const google=spec.provider==='google';
  const path=spec.provider==='openai'?'/v1/chat/completions':'/v1/messages';
  const pathOk=google?([`/v1beta/models/${spec.model}:generateContent`,`/v1beta/models/${spec.model}:streamGenerateContent`].includes(url.pathname)&&(url.search===''||url.search==='?alt=sse')):(url.pathname===path&&!url.search);
  if(url.origin!==ORIGINS[spec.provider]||!pathOk||url.username||url.password||url.hash||req.method!=='POST')throw Error('Provider endpoint is not allowed');
  const raw=await req.text();const inputBytes=Buffer.byteLength(raw);if(inputBytes>MAX_INPUT_BYTES)throw Error('Provider input exceeds 128KB');
  const body=record(JSON.parse(raw));
  if(google){
   if(body.tools||body.cachedContent||!Array.isArray(body.contents)||body.contents.length>80)throw Error('Only text-only Gemini requests are supported');
   const entries=[...body.contents,...(body.systemInstruction?[body.systemInstruction]:[])];
   for(const item of entries){const parts=record(item).parts;if(!Array.isArray(parts)||parts.some(p=>Object.keys(record(p)).some(k=>k!=='text')||typeof record(p).text!=='string'))throw Error('Only Gemini text parts are supported');}
   const config=record(body.generationConfig);config.thinkingConfig={thinkingBudget:0};body.generationConfig=config;
  } else {if(body.model!==spec.model)throw Error('Provider model mismatch');textOnly(body);}
  const maxOutputTokens=Number(google?record(body.generationConfig).maxOutputTokens:body.max_tokens??body.max_completion_tokens);if(!Number.isInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>MAX_OUTPUT_TOKENS)throw Error('Provider output limit must be 1–4096 tokens');
  if(body.stream && spec.provider==='openai')body.stream_options={include_usage:true};
  const remaining=Math.min(45_000,ctx.deadlineMs-Date.now());if(remaining<1)throw Error('Request deadline expired');
  const signal=AbortSignal.any([req.signal,AbortSignal.timeout(remaining),...(ctx.signal?[ctx.signal]:[])]);
  const reservation=await reserve({provider:spec.provider,model:spec.model,kind:spec.kind||'generation',maximumUsd:((inputBytes+2048)*price.input+maxOutputTokens*price.output)/1e6,inputBytes,maxOutputTokens,shared:spec.shared});
  let dispatched=false,recorded=false;
  try {
   signal.throwIfAborted();await markDispatched(reservation.id);dispatched=true;
   const headers=new Headers(req.headers);headers.set('accept-encoding','identity');
   const response=await fetch(req.url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal});
   const enc=response.headers.get('content-encoding');if(enc&&!['identity','gzip','deflate','br'].includes(enc.toLowerCase()))throw Error('Unsupported response encoding');
   const reader=response.body?.getReader();const chunks:Uint8Array[]=[];let count=0;
   if(reader){try{for(;;){signal.throwIfAborted();const item=await reader.read();if(item.done)break;count+=item.value.byteLength;if(count>MAX_PROVIDER_BYTES)throw Error('Provider response exceeds limit');chunks.push(item.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}}
   const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const usage=responseUsage(bytes,response.headers.get('content-type')||'',spec.provider);
   if(usage){await settle(reservation.id,{...usage,actualUsd:providerCost(spec.model,usage)});recorded=true;}
   else {await markUncertain(reservation.id,{errorClass:response.ok?'usage_unavailable':'provider_http_error'});recorded=true;throw Error('Provider usage is unavailable; reserved cost remains uncertain');}
   if(!response.ok)throw Error(`Provider rejected the request (HTTP ${response.status}); no automatic retry`);
   const clean=new Headers();for(const name of ['content-type','x-request-id','request-id']){const value=response.headers.get(name);if(value)clean.set(name,value);}
   // Node fetch has already decoded compressed responses. Never forward stale encoding/length.
   return new Response(bytes,{status:response.status,headers:clean});
  } catch {
   if(!recorded){if(dispatched)await markUncertain(reservation.id,{errorClass:'transport_unknown'});else await releaseUndispatched(reservation.id);}
   throw Error(dispatched?'Provider request did not complete. Usage may have been incurred; no automatic retry.':'Provider dispatch was denied.');
  }
 };
}
