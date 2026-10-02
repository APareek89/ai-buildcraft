import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiImage, generateGeminiVideo, parseImage } from '../src/lib/gemini-media.ts';
process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W+1sAAAAASUVORK5CYII=';
const input = `data:image/png;base64,${png}`;
const imageResponse = { candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] };
const json = (value, status=200) => new Response(JSON.stringify(value), { status });
function mocked(handler) { let now=0; const calls=[]; return { calls, now:()=>now, sleep: async ms=>{now+=ms;}, fetch:async (...args)=>{calls.push(args);return handler(...args);} }; }
// Unexpected ambient network cannot silently pass a contract test.
globalThis.fetch = async () => { throw new Error('Network is blocked in free contracts'); };

test('generation uses direct Gemini endpoint, key header, prompt and requested aspect', async()=>{
  const t=mocked((url,opts)=>{
    assert.match(url,/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.1-flash-image:generateContent$/);
    assert.equal(opts.headers['x-goog-api-key'],process.env.GEMINI_API_KEY);
    assert.equal(opts.redirect,'error');
    const body=JSON.parse(opts.body); assert.equal(body.generationConfig.imageConfig.aspectRatio,'16:9');
    assert.deepEqual(body.contents[0].parts,[{text:'A ceramic cup'}]);return json(imageResponse);
  });
  const out=await generateGeminiImage('A ceramic cup','16:9',undefined,t);
  assert.equal(out.mime,'image/png');assert.deepEqual(out.bytes,Buffer.from(png,'base64'));assert.equal(t.calls.length,1);
});
test('editing sends original inline bytes instead of a public URL',async()=>{
  const t=mocked((url,opts)=>{assert.deepEqual(JSON.parse(opts.body).contents[0].parts[1],{inlineData:{mimeType:'image/png',data:png}});return json(imageResponse);});
  await generateGeminiImage('Improve light','1:1',input,t);
});
test('safety refusal and text-only result do not retry or invent an image',async()=>{
  for(const body of [{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'IMAGE_SAFETY'}]},{candidates:[{content:{parts:[{text:'Declined'}]}}]}]) {
    const t=mocked(()=>json(body));await assert.rejects(generateGeminiImage('cup','1:1',undefined,t));assert.equal(t.calls.length,1);
  }
});
test('malformed input, corrupt output and over-limit output fail',async()=>{
  assert.throws(()=>parseImage('https://example.invalid/photo.png'));
  const t=mocked(()=>json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.from('not an image').toString('base64')}}]}}]}));
  await assert.rejects(generateGeminiImage('cup','1:1',undefined,t),/Invalid image response/);
  assert.throws(()=>parseImage('data:image/png;base64,'+'A'.repeat(18*1024*1024)),/Invalid image data/);
});
test('video submit, bounded poll and authenticated download return persistent-ready bytes',async()=>{
  let step=0;
  const t=mocked((url,opts)=>{
    step++;
    if(step===1){const body=JSON.parse(opts.body);assert.equal(body.instances[0].image.inlineData.data,png);assert.equal(body.parameters.aspectRatio,'9:16');assert.equal(body.parameters.durationSeconds,6);return json({name:'models/veo-3.1-fast-generate-preview/operations/test'});}
    if(step===2){assert.match(url,/\/operations\/test$/);return json({name:'models/veo-3.1-fast-generate-preview/operations/test',done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/clip:download?alt=media'}}]}}});}
    assert.equal(opts.headers['x-goog-api-key'],process.env.GEMINI_API_KEY);return new Response(Buffer.from('0000ftypmp42'));
  });
  const out=await generateGeminiVideo('Slow pan',input,t);assert.equal(out.mime,'video/mp4');assert.equal(t.calls.length,3);
});
test('video redirects to storage omit credentials; unknown hosts are rejected',async()=>{
  let step=0; const t=mocked((url,opts)=>{
    step++;
    if(step===1)return json({name:'models/veo-test/operations/test',done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/clip:download'}}]}}});
    if(step===2)return new Response(null,{status:302,headers:{location:'https://storage.googleapis.com/generated/clip.mp4?signature=synthetic'}});
    assert.deepEqual(opts.headers,{});return new Response(Buffer.from('0000ftypmp42'));
  });
  await generateGeminiVideo('Slow pan',input,t);
  const bad=mocked(()=>json({name:'models/veo-test/operations/test',done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://attacker.invalid/steal'}}]}}}));
  await assert.rejects(generateGeminiVideo('Slow pan',input,bad),/Unexpected video download host/);assert.equal(bad.calls.length,1);
});
test('unknown operation paths, terminal errors and a poll deadline fail safely',async()=>{
  for(const body of [{name:'https://attacker.invalid/collect'},{name:'models/veo-test/operations/test',done:true,error:{message:'secret provider body'}},{name:'models/veo-test/operations/test'}]) {
    const t=mocked(()=>json(body));await assert.rejects(generateGeminiVideo('Slow pan',input,t),error=>!error.message.includes('secret provider body'));assert.ok(t.calls.length<=36);
  }
});
