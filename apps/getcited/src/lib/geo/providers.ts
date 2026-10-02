import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { PanelistId, ProviderKeys } from "./types";
import { PANELIST_MODELS } from "./models";
import { meteredFetch, VERIFIED_PRICES } from "./provider-transport";

export function modelFor(modelId:string,keys:ProviderKeys):LanguageModel {
 if(keys.shared!==false && modelId!=='gpt-4o-mini')throw Error('Hosted service supports GPT-4o mini; other models require your own key');
 if(!VERIFIED_PRICES[modelId])throw Error('This model is unavailable: verified hosted pricing is required');
 if(modelId==='gemini-2.5-flash-lite'){
  if(!keys.gemini)throw Error('Gemini credentials are not configured');
  return createGoogleGenerativeAI({apiKey:keys.gemini,fetch:meteredFetch({provider:'google',model:modelId,shared:false})})(modelId);
 }
 if(modelId.startsWith('gpt-')){
  if(!keys.openai)throw Error('OpenAI credentials are not configured');
  return createOpenAICompatible({name:'openai',supportsStructuredOutputs:true,includeUsage:true,baseURL:'https://api.openai.com/v1',apiKey:keys.openai,fetch:meteredFetch({provider:'openai',model:modelId,shared:keys.shared!==false})})(modelId);
 }
 if(!keys.anthropic)throw Error('Anthropic credentials are not configured');
 return createAnthropic({apiKey:keys.anthropic,fetch:meteredFetch({provider:'anthropic',model:modelId,shared:keys.shared!==false})})(modelId);
}
export function defaultModel(keys:ProviderKeys):LanguageModel{return modelFor(keys.openai?'gpt-4o-mini':'claude-haiku-4-5',keys);}
export function panelistModel(id:PanelistId,keys:ProviderKeys):LanguageModel {
 if(id==='custom'){
  const cfg=parseCustomConfig(keys.custom||'');
  if(cfg.baseURL!=='https://api.openai.com/v1')throw Error('Custom endpoint is unsupported; use the verified OpenAI endpoint');
  return modelFor(cfg.model,{openai:cfg.apiKey,shared:false});
 }
 return modelFor(PANELIST_MODELS[id].modelId,keys);
}
export interface CustomModelConfig {baseURL:string;model:string;apiKey:string;}
export function parseCustomConfig(blob:string):CustomModelConfig {
 let parsed:unknown;try{parsed=JSON.parse(blob);}catch{throw Error('Custom model config is not valid JSON');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Custom model configuration is invalid');
 const p=parsed as Partial<CustomModelConfig>;
 const baseURL=typeof p.baseURL==='string'?p.baseURL.trim().replace(/\/$/,''):'';
 const model=typeof p.model==='string'?p.model.trim():'';const apiKey=typeof p.apiKey==='string'?p.apiKey.trim():'';
 if(!baseURL||!model||!apiKey||apiKey.length>4096||model.length>128)throw Error('Custom model config is missing or exceeds bounds');
 return {baseURL,model,apiKey};
}
/** Compatibility for explicitly selected Anthropic paths. */
export function anthropicModel(modelId:string,apiKey:string):LanguageModel {return modelFor(modelId,{anthropic:apiKey,shared:true});}
