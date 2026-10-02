import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {generateText,generateObject,tool,stepCountIs} from 'ai';
import {z} from 'zod';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
const state=vi.hoisted(()=>({mode:'live',deadlineMs:Date.now()+120000,dispatch:0,settled:[] as unknown[],uncertain:0,reserved:0}));
vi.mock('@/lib/server/execution',()=>({requireExecution:()=>({mode:state.mode,deadlineMs:state.deadlineMs})}));
vi.mock('@/lib/server/usage',()=>({reserve:vi.fn(async()=>{state.reserved++;return{id:'fixture'};}),markDispatched:vi.fn(async()=>{state.dispatch++;}),settle:vi.fn(async(_id,v)=>{state.settled.push(v);}),releaseUndispatched:vi.fn(),markUncertain:vi.fn(async()=>{state.uncertain++;})}));
import {modelFor} from './providers';
import {meteredFetch,MAX_PROVIDER_BYTES,responseUsage} from './provider-transport';
import {isPublicAddress,publicUrl} from './safe-network';
const wire=(text='Ready')=>({id:'fixture-response',object:'chat.completion',created:1,model:'gpt-4o-mini-2024-07-18',choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:3,prompt_tokens_details:{cached_tokens:2}}});
const realFetch=globalThis.fetch;
beforeEach(()=>{state.mode='live';state.deadlineMs=Date.now()+120000;state.dispatch=state.uncertain=state.reserved=0;state.settled=[];});
afterEach(()=>{vi.unstubAllGlobals();});
describe('bounded metered SDK transport',()=>{
 it('actual SDK consumes compressed provider response once and settles returned model before return',async()=>{
  const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json','content-encoding':'gzip'});res.end(gzipSync(JSON.stringify(wire())));});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const address=server.address() as {port:number};const seen:unknown[]=[];
  vi.stubGlobal('fetch',async(_input:RequestInfo|URL,init?:RequestInit)=>{seen.push(JSON.parse(init!.body as string));return realFetch(`http://127.0.0.1:${address.port}`);});
  try{const out=await generateText({model:modelFor('gpt-4o-mini',{openai:'synthetic-fixture',shared:true}),prompt:'Say Ready',maxOutputTokens:64,maxRetries:0});expect(out.text).toBe('Ready');expect(state.dispatch).toBe(1);expect(seen).toHaveLength(1);expect(state.settled[0]).toMatchObject({inputTokens:12,outputTokens:3,cachedInputTokens:2,providerModel:'gpt-4o-mini-2024-07-18'});}finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
 it('known usage survives invalid structured answer without paid retry',async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify(wire('not valid JSON')),{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetch);
  await expect(generateObject({model:modelFor('gpt-4o-mini',{openai:'synthetic-fixture'}),schema:z.object({value:z.string()}),prompt:'Return a value',maxOutputTokens:64,maxRetries:0})).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);expect(state.settled).toHaveLength(1);expect(state.uncertain).toBe(0);
 });
 it('actual SDK tool roundtrip uses two distinct metered dispatches without retry',async()=>{
  const bodies:Record<string,unknown>[]=[];vi.stubGlobal('fetch',async(_input:RequestInfo|URL,init?:RequestInit)=>{bodies.push(JSON.parse(init!.body as string));const response=bodies.length===1?{...wire(),choices:[{index:0,message:{role:'assistant',content:null,tool_calls:[{id:'call_one',type:'function',function:{name:'lookup',arguments:'{"brand":"Acme"}'}}]},finish_reason:'tool_calls'}]}:wire('Acme checked');return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}});});
  const result=await generateText({model:modelFor('gpt-4o-mini',{openai:'synthetic-fixture'}),prompt:'Check Acme',tools:{lookup:tool({inputSchema:z.object({brand:z.string()}),execute:async({brand})=>({brand,found:true})})},stopWhen:stepCountIs(2),maxOutputTokens:64,maxRetries:0});expect(result.text).toBe('Acme checked');expect(bodies).toHaveLength(2);expect(JSON.stringify(bodies[1].messages)).toContain('tool_call_id');expect(state.settled).toHaveLength(2);
 });
 it('whole response deadline aborts an actual hanging local transport',async()=>{
  const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.write('{');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};state.deadlineMs=Date.now()+80;vi.stubGlobal('fetch',async(_input:RequestInfo|URL,init?:RequestInit)=>realFetch(`http://127.0.0.1:${address.port}`,{signal:init?.signal}));
  try{await expect(generateText({model:modelFor('gpt-4o-mini',{openai:'synthetic-fixture'}),prompt:'x',maxOutputTokens:64,maxRetries:0})).rejects.toThrow();expect(state.dispatch).toBe(1);expect(state.uncertain).toBe(1);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
 it('actual Gemini SDK uses bounded text request with thinking off and settles usage',async()=>{
  let observed:Record<string,unknown>={};vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{expect(String(input)).toContain('gemini-2.5-flash-lite:generateContent');observed=JSON.parse(init!.body as string);return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:'Gemini fixture'}]},finishReason:'STOP',index:0}],usageMetadata:{promptTokenCount:8,candidatesTokenCount:3,totalTokenCount:11},modelVersion:'gemini-2.5-flash-lite'}),{headers:{'content-type':'application/json'}});});
  const out=await generateText({model:modelFor('gemini-2.5-flash-lite',{gemini:'synthetic-fixture',shared:false}),prompt:'Say ready',maxOutputTokens:64,maxRetries:0});expect(out.text).toBe('Gemini fixture');expect(observed.generationConfig).toMatchObject({maxOutputTokens:64,thinkingConfig:{thinkingBudget:0}});expect(state.dispatch).toBe(1);expect(state.settled[0]).toMatchObject({inputTokens:8,outputTokens:3});
 });
 it('valid answer without usage fails instead of publishing a false zero-cost result',async()=>{
  const response=wire();const {usage: _usage,...withoutUsage}=response;void _usage;
  const send=vi.fn(async()=>new Response(JSON.stringify(withoutUsage),{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',send);
  await expect(generateText({model:modelFor('gpt-4o-mini',{openai:'synthetic-fixture'}),prompt:'x',maxOutputTokens:64,maxRetries:0})).rejects.toThrow('Usage may have been incurred');
  expect(send).toHaveBeenCalledTimes(1);expect(state.uncertain).toBe(1);expect(state.settled).toHaveLength(0);
 });
 it('transport ambiguity retains charge reservation, no retries',async()=>{const fetch=vi.fn(async()=>{throw Error('socket dropped');});vi.stubGlobal('fetch',fetch);await expect(generateText({model:modelFor('gpt-4o-mini',{openai:'synthetic-fixture'}),prompt:'x',maxOutputTokens:64,maxRetries:0})).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);expect(state.uncertain).toBe(1);});
 it('bounds success and error decoded bodies',async()=>{for(const status of [200,400]){vi.stubGlobal('fetch',async()=>new Response('x'.repeat(MAX_PROVIDER_BYTES+1),{status}));await expect(generateText({model:modelFor('gpt-4o-mini',{openai:'synthetic-fixture'}),prompt:'x',maxOutputTokens:64,maxRetries:0})).rejects.toThrow();}expect(state.dispatch).toBe(2);expect(state.uncertain).toBe(2);});
 it('denies prepared, foreign endpoint, oversized text/output before reserve',async()=>{
  const send=meteredFetch({provider:'openai',model:'gpt-4o-mini',shared:true});const body={model:'gpt-4o-mini',messages:[{role:'user',content:'x'}],max_tokens:64};const req=(url='https://api.openai.com/v1/chat/completions',data=body)=>send(url,{method:'POST',body:JSON.stringify(data)});
  state.mode='prepared';await expect(req()).rejects.toThrow();state.mode='live';await expect(req('https://127.0.0.1/v1/chat/completions')).rejects.toThrow();await expect(req(undefined,{...body,max_tokens:4097})).rejects.toThrow();await expect(req(undefined,{...body,messages:[{role:'user',content:'x'.repeat(128000)}]})).rejects.toThrow();expect(state.reserved).toBe(0);
 });
 it('extracts streaming usage and preserves zero-valued usage',()=>{const bytes=new TextEncoder().encode(`data: ${JSON.stringify({...wire(),usage:{prompt_tokens:0,completion_tokens:0}})}\n\ndata: [DONE]\n\n`);expect(responseUsage(bytes,'text/event-stream','openai')).toMatchObject({inputTokens:0,outputTokens:0});});
 it('rejects metadata/private/encoded and redirect destinations',()=>{for(const value of ['127.0.0.1','169.254.169.254','10.0.0.1','172.16.0.1','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1'])expect(isPublicAddress(value)).toBe(false);for(const url of ['https://169.254.169.254/x','https://2130706433/','https://user:password@example.com/','http://example.com/','https://example.com:8443/'])expect(()=>publicUrl(url)).toThrow();expect(isPublicAddress('93.184.216.34')).toBe(true);});
});
