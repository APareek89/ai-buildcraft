import {z} from 'zod';
import {serverProviderKeys} from '../geo/keys';
import {getStoredProviderKeys} from '../db/api-keys';
import type {ProviderKeys} from '../geo/types';
import {HttpError} from './http';
const credential=z.string().min(8).max(2000);
export const SessionKeys=z.object({openai:credential.optional(),anthropic:credential.optional(),gemini:credential.optional(),groq:credential.optional(),perplexity:credential.optional(),custom:credential.optional()}).strict();
export async function resolveKeys(input:unknown,mode?:string):Promise<ProviderKeys>{
 if(input!==undefined&&input!==null){const parsed=SessionKeys.safeParse(input);if(!parsed.success)throw new HttpError(400,'Invalid session provider credentials.');if(Object.keys(parsed.data).length)return {...(mode==='self_serve'?await getStoredProviderKeys():{}),...parsed.data,shared:false};}
 return mode==='self_serve'?getStoredProviderKeys():serverProviderKeys();
}
