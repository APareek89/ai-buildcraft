import "server-only";
import {and,eq} from "drizzle-orm";
import {drizzleDatabase,schema} from "./client";
import {repositoryOwner} from "../auth";
import {HttpError} from "../server/http";
import {encryptSecret,decryptSecret} from "../crypto";
import type {ProviderKeys} from "../geo/types";
export const KEY_PROVIDERS=["openai","anthropic","perplexity","gemini","groq","custom"] as const;
export type KeyProvider=(typeof KEY_PROVIDERS)[number];
export async function storeEncryptedKey(userId:string,provider:KeyProvider,plaintext:string){const owner=await repositoryOwner(userId);if(!KEY_PROVIDERS.includes(provider)||typeof plaintext!=='string'||plaintext.length<8||plaintext.length>2000)throw new HttpError(400,'Invalid provider credential.');const enc=encryptSecret(plaintext),db=await drizzleDatabase();await db.insert(schema.apiKeys).values({userId:owner,provider,...enc}).onConflictDoUpdate({target:[schema.apiKeys.userId,schema.apiKeys.provider],set:{...enc,createdAt:new Date()}});}
export async function deleteStoredKey(provider:KeyProvider){const owner=await repositoryOwner(),db=await drizzleDatabase();await db.delete(schema.apiKeys).where(and(eq(schema.apiKeys.userId,owner),eq(schema.apiKeys.provider,provider)));}
export async function listStoredProviders():Promise<KeyProvider[]>{const owner=await repositoryOwner(),db=await drizzleDatabase();return (await db.select({provider:schema.apiKeys.provider}).from(schema.apiKeys).where(eq(schema.apiKeys.userId,owner))).map(r=>r.provider as KeyProvider);}
export async function getStoredProviderKeys():Promise<ProviderKeys>{const owner=await repositoryOwner(),db=await drizzleDatabase();const rows=await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId,owner));const keys:ProviderKeys={shared:false};for(const r of rows){if(!KEY_PROVIDERS.includes(r.provider as KeyProvider))continue;try{(keys as Record<string,unknown>)[r.provider]=decryptSecret(r);}catch{throw new HttpError(503,'A stored credential could not be read. Re-enter that credential.');}}return keys;}
