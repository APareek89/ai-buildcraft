import {describe,it,expect,vi} from 'vitest';
import {convertToModelMessages,DefaultChatTransport,generateText,type UIMessage} from 'ai';
import {Chat} from '@ai-sdk/react';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';
import {CHAT_MESSAGE_BYTES,userMessage,recoverChatMessages,INTERRUPTED_TOOL,INTERRUPTED_RESPONSE,MESSAGE_TOO_LARGE,chatErrorMessage} from './chat-recovery';
import {HttpError,route} from './server/http';
import {isSessionFailure} from './client/identity';

describe('chat input and interruption recovery',()=>{
 it('measures the exact UTF-8 serialized message and attachment before sending',()=>{
  const normal=userMessage('id','Ask',{name:'plan.txt',text:'a'.repeat(12000)});
  expect(new TextEncoder().encode(JSON.stringify(normal)).byteLength).toBeLessThan(CHAT_MESSAGE_BYTES);
  expect(()=>userMessage('id','Ask',{name:'plan.txt',text:'a'.repeat(20000)})).toThrow(MESSAGE_TOO_LARGE);
  expect(()=>userMessage('id','😀'.repeat(4100))).toThrow(MESSAGE_TOO_LARGE);
 });
 it('retains completed work, marks unfinished tools, and converts safely for the next turn',async()=>{
  const messages:UIMessage[]=[userMessage('first','Benchmark'),{id:'answer',role:'assistant',parts:[{type:'tool-run_benchmark',toolCallId:'call1',state:'input-available',input:{}}]}];
  const recovered=recoverChatMessages(messages,true);
  expect(recovered[0]).toEqual(messages[0]);expect(messages[1].parts[0]).toHaveProperty('state','input-available');
  expect(recovered[1].parts[0]).toMatchObject({state:'output-error',errorText:INTERRUPTED_TOOL});
  expect(recovered[1].parts[1]).toEqual({type:'text',text:INTERRUPTED_RESPONSE});
  const model=await convertToModelMessages([...recovered,userMessage('second','Just summarize')],{ignoreIncompleteToolCalls:true});
  expect(model.some(m=>m.role==='tool')).toBe(true);expect(model.at(-1)?.role).toBe('user');
  expect(recoverChatMessages(recovered,true)).toEqual(recovered);
 });
 it('never displays raw provider error or credentials in a recovery alert',()=>{
  expect(chatErrorMessage(new Error('provider key secret-body'))).toBe(INTERRUPTED_RESPONSE);
  expect(chatErrorMessage(new Error('Save a new ordinary configuration before chatting with a provider.'))).toContain('configuration');
 });
 it.each(['','{"prompt":"part'])('actual SDK Stop preserves partial tool input %j and omits it from the next provider request',async delta=>{
  const encoder=new TextEncoder();let aborted=false;let sends=0;
  const chat=new Chat({transport:new DefaultChatTransport({api:'https://fixture.invalid/chat',fetch:async(_url,init)=>{
   sends++;
   const stream=new ReadableStream<Uint8Array>({start(controller){
    for(const event of [{type:'start',messageId:'partial-answer'},{type:'start-step'},{type:'tool-input-start',toolCallId:'partial-call',toolName:'run_benchmark'},...(delta?[{type:'tool-input-delta',toolCallId:'partial-call',inputTextDelta:delta}]:[])])controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    init?.signal?.addEventListener('abort',()=>{aborted=true;controller.error(new DOMException('Stopped','AbortError'));},{once:true});
   }});
   return new Response(stream,{headers:{'content-type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1'}});
  }})});
  const pending=chat.sendMessage(userMessage('first','Benchmark'));
  await vi.waitFor(()=>expect(chat.messages.at(-1)?.parts.some(p=>'state'in p&&p.state==='input-streaming')).toBe(true));
  await chat.stop();await pending;expect(aborted).toBe(true);expect(sends).toBe(1);
  const restored=recoverChatMessages(chat.messages,true);
  expect(restored.at(-1)?.parts).toContainEqual({type:'text',text:INTERRUPTED_RESPONSE});
  expect(restored.at(-1)?.parts.some(p=>'state'in p&&p.state==='input-streaming')).toBe(true);
  expect(recoverChatMessages(restored,true)).toEqual(restored);
  let providerCalls=0;let sentMessages:unknown[]=[];
  const model=createOpenAICompatible({name:'fixture',baseURL:'https://fixture.invalid/v1',apiKey:'synthetic',fetch:async(_url,init)=>{
   providerCalls++;sentMessages=JSON.parse(init?.body as string).messages;
   return Response.json({id:'fixture',object:'chat.completion',created:1,model:'fixture',choices:[{index:0,message:{role:'assistant',content:'Recovered.'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12}});
  }})('fixture');
  const result=await generateText({model,messages:await convertToModelMessages([...restored,userMessage('second','Continue')],{ignoreIncompleteToolCalls:true}),maxRetries:0});
  expect(result.text).toBe('Recovered.');expect(providerCalls).toBe(1);
  expect(JSON.stringify(sentMessages)).not.toContain('tool_calls');expect(JSON.stringify(sentMessages)).not.toContain('partial-call');
  expect(sentMessages.at(-1)).toMatchObject({role:'user',content:'Continue'});
 });
 it('ordinary conflicts preserve the session; actual owner mismatch invalidates it',async()=>{
  const conflict=await route(async()=>{throw new HttpError(409,'Start a new message or thread.');})();
  const value=await conflict.json();expect(value.code).toBe('CONFLICT');expect(isSessionFailure(value)).toBe(false);
  const expired=await route(async()=>{throw new HttpError(409,'session_expired');})();
  expect(isSessionFailure(await expired.json())).toBe(true);
 });
});
