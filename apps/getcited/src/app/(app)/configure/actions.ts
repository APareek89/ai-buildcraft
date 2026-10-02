"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {requireExecution} from "@/lib/server/execution";
import { withAction, type ActionFailure } from "@/lib/server/actions";
import {withCapacity} from "@/lib/server/usage";
import { saveConfigVersion, getActiveConfig, type ConfigView } from "@/lib/db/configs";
import {resolveKeys} from "@/lib/server/keys";
import {HttpError} from "@/lib/server/http";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  storeEncryptedKey,
  deleteStoredKey,
  listStoredProviders,
  type KeyProvider,
} from "@/lib/db/api-keys";
import {updateConfigMode} from "@/lib/db/configs";
import {
  suggestQueries,
  discoverCompetitors,
  normalizeUrl,
} from "@/lib/geo/assist";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string;code?:ActionFailure["code"] };

// FMEA #4: cap our-key Claude usage per user for the assist actions.
const ASSIST_LIMIT = { limit: 15, windowMs: 60_000 };

const urlish = z.string().trim().min(3).max(300);

const SaveSchema = z.object({
  brandUrl: urlish,
  brandName: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  competitors: z.array(z.string().trim().min(1).max(300)).max(15),
  // Parallel to competitors; "" when unknown (e.g. user typed a plain name).
  competitorDomains: z.array(z.string().trim().max(300)).max(15).optional(),
  queries: z.array(z.string().trim().min(1).max(400)).max(30),
  budgetUsd: z.number().min(0).max(1_000_000),
  teamSize: z.number().int().min(1).max(100),
  timelineWeeks: z.number().int().min(1).max(104),
  mode: z.enum(["we_serve", "self_serve"]).default("we_serve"),
});

/**
 * Competitors must be stored as brand NAMES (mention matching in AI answers) plus a
 * parallel domain (citation attribution). A URL-ish entry is split into both; a plain
 * name keeps the provided/empty domain. (Storing raw URLs as "names" was why SoV came
 * back empty — the parser can't find "https://runwayml.com" in prose.)
 */
function competitorNameAndDomain(entry: string, providedDomain?: string): { name: string; domain: string } {
  const trimmed = entry.trim();
  const urlish = /^https?:\/\//i.test(trimmed) || (!trimmed.includes(" ") && /\.[a-z]{2,}$/i.test(trimmed));
  if (urlish) {
    try {
      const host = new URL(normalizeUrl(trimmed)).host.replace(/^www\./, "").toLowerCase();
      const base = host.split(".")[0] ?? host;
      return { name: base.charAt(0).toUpperCase() + base.slice(1), domain: host };
    } catch {
      /* fall through */
    }
  }
  return { name: trimmed, domain: (providedDomain ?? "").toLowerCase() };
}

/** Derive candidate owned domains from a brand URL (host + apex). */
function deriveDomains(brandUrl: string): string[] {
  try {
    const host = new URL(normalizeUrl(brandUrl)).host.replace(/^www\./, "");
    const parts = host.split(".");
    const apex = parts.length > 2 ? parts.slice(-2).join(".") : host;
    return Array.from(new Set([host, apex]));
  } catch {
    return [];
  }
}

async function saveConfigActionImpl(
  raw: z.input<typeof SaveSchema>,
): Promise<ActionResult<ConfigView>> {
  const user = {id:requireExecution().ownerId};
  const parsed = SaveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid config" };
  }
  const v = parsed.data;
  const pairs = v.competitors.map((c, i) => competitorNameAndDomain(c, v.competitorDomains?.[i]));
  try {
    const saved = await saveConfigVersion(user.id, {
      brandUrl: normalizeUrl(v.brandUrl),
      brandName: v.brandName || null,
      description: v.description || null,
      brandDomains: deriveDomains(v.brandUrl),
      competitors: pairs.map((p) => p.name),
      competitorDomains: pairs.map((p) => p.domain),
      queries: v.queries,
      budgetUsd: v.budgetUsd,
      teamSize: v.teamSize,
      timelineWeeks: v.timelineWeeks,
      mode: v.mode,
    });
    revalidatePath("/configure");
    revalidatePath("/dashboard");
    return { ok: true, data: saved };
  } catch {
    return { ok: false, error: "Configuration could not be saved." };
  }
}

const SuggestSchema = z.object({
  brand: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(200).optional(),
  competitors: z.array(z.string().trim()).max(15).optional(),
});

async function suggestQueriesActionImpl(
  raw: z.input<typeof SuggestSchema>,
): Promise<ActionResult<string[]>> {
  const user = {id:requireExecution().ownerId};
  const rl = checkRateLimit(`assist:${user.id}`, ASSIST_LIMIT);
  if (!rl.ok) {
    return { ok: false, error: `Too many requests — try again in ${Math.ceil(rl.retryAfterMs / 1000)}s` };
  }
  const parsed = SuggestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter a brand first" };
  const cfg = await getActiveConfig();
  if(cfg?.prepared)throw new HttpError(409,"Save a new ordinary configuration before using provider assistance.");
  const keys = await resolveKeys(undefined,cfg?.mode??"we_serve");
  if(cfg?.mode==="self_serve"&&!keys.openai&&!keys.anthropic&&!keys.gemini)throw new HttpError(400,"Store a supported provider key for Self Serve before using assistance.");
  if (!keys.openai && !keys.anthropic && !keys.gemini && process.env.GETCITED_MOCK_MODE!=="1") {
    return { ok: false, error: "A server provider is not configured" };
  }
  try {
    const queries = await suggestQueries({ ...parsed.data, keys });
    return { ok: true, data: queries };
  } catch {
    return { ok: false, error: "Queries could not be generated. Any dispatched usage remains recorded." };
  }
}

const DiscoverSchema = z.object({
  brandUrl: urlish,
  brandName: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
});

async function discoverCompetitorsActionImpl(
  raw: z.input<typeof DiscoverSchema>,
): Promise<ActionResult<{ name: string; url: string }[]>> {
  const user = {id:requireExecution().ownerId};
  const rl = checkRateLimit(`assist:${user.id}`, ASSIST_LIMIT);
  if (!rl.ok) {
    return { ok: false, error: `Too many requests — try again in ${Math.ceil(rl.retryAfterMs / 1000)}s` };
  }
  const parsed = DiscoverSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter your brand URL first" };
  const cfg = await getActiveConfig();
  if(cfg?.prepared)throw new HttpError(409,"Save a new ordinary configuration before using provider assistance.");
  const keys = await resolveKeys(undefined,cfg?.mode??"we_serve");
  if(cfg?.mode==="self_serve"&&!keys.openai&&!keys.anthropic&&!keys.gemini)throw new HttpError(400,"Store a supported provider key for Self Serve before using assistance.");
  if (!keys.openai && !keys.anthropic && !keys.gemini && process.env.GETCITED_MOCK_MODE!=="1") {
    return { ok: false, error: "A server provider is not configured" };
  }
  try {
    const competitors = await discoverCompetitors({
      brandUrl: normalizeUrl(parsed.data.brandUrl),
      brandName: parsed.data.brandName,
      description: parsed.data.description,
      keys,
    });
    return { ok: true, data: competitors };
  } catch {
    return { ok: false, error: "Competitors could not be discovered. Any dispatched usage remains recorded." };
  }
}

// ── Self Serve (Phase 4) ─────────────────────────────────────────────────────

const ModeSchema = z.enum(["we_serve", "self_serve"]);

/** Switch We Serve / Self Serve on the active config (in place, no new version). */
async function saveModeActionImpl(mode: string): Promise<ActionResult<{ mode: string }>> {
  
  const parsed = ModeSchema.safeParse(mode);
  if (!parsed.success) return { ok: false, error: "Invalid mode" };
  const cfg = await getActiveConfig();
  if (!cfg) return { ok: false, error: "Save your config first." };
  await updateConfigMode(cfg.id, parsed.data);
  revalidatePath("/configure");
  return { ok: true, data: { mode: parsed.data } };
}

const StoreKeySchema = z.object({
  // "custom" carries a JSON blob {baseURL, model, apiKey}; its max is larger to fit
  // all three fields plus JSON overhead.
  provider: z.enum(["openai", "anthropic", "perplexity", "gemini", "groq", "custom"]),
  key: z.string().trim().min(8).max(2000),
});

/** Store an encrypted BYO key (opt-in). The plaintext is encrypted, never persisted raw. */
async function storeKeyActionImpl(
  raw: z.input<typeof StoreKeySchema>,
): Promise<ActionResult<{ provider: KeyProvider }>> {
  const user = {id:requireExecution().ownerId};
  const parsed = StoreKeySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter a valid key" };
  try {
    await storeEncryptedKey(user.id, parsed.data.provider, parsed.data.key);
    revalidatePath("/configure");
    return { ok: true, data: { provider: parsed.data.provider } };
  } catch {
    return { ok: false, error: "Credential could not be stored." };
  }
}

async function deleteKeyActionImpl(provider: string): Promise<ActionResult<null>> {
  
  const parsed = z.enum(["openai", "anthropic", "perplexity", "gemini", "groq", "custom"]).safeParse(provider);
  if (!parsed.success) return { ok: false, error: "Invalid provider" };
  await deleteStoredKey(parsed.data);
  revalidatePath("/configure");
  return { ok: true, data: null };
}

async function listStoredKeysActionImpl(): Promise<ActionResult<KeyProvider[]>> {
  
  try {
    return { ok: true, data: await listStoredProviders() };
  } catch {
    return { ok: false, error: "Stored providers could not be listed." };
  }
}

export async function saveConfigAction(raw:z.input<typeof SaveSchema>,expectedOwnerId:string):Promise<ActionResult<ConfigView>>{return withAction(expectedOwnerId,()=>saveConfigActionImpl(raw));}
export async function suggestQueriesAction(raw:z.input<typeof SuggestSchema>,expectedOwnerId:string):Promise<ActionResult<string[]>>{return withAction(expectedOwnerId,()=>withCapacity(()=>suggestQueriesActionImpl(raw)));}
export async function discoverCompetitorsAction(raw:z.input<typeof DiscoverSchema>,expectedOwnerId:string):Promise<ActionResult<{name:string;url:string}[]>>{return withAction(expectedOwnerId,()=>withCapacity(()=>discoverCompetitorsActionImpl(raw)));}
export async function saveModeAction(mode:string,expectedOwnerId:string):Promise<ActionResult<{mode:string}>>{return withAction(expectedOwnerId,()=>saveModeActionImpl(mode));}
export async function storeKeyAction(raw:z.input<typeof StoreKeySchema>,expectedOwnerId:string):Promise<ActionResult<{provider:KeyProvider}>>{return withAction(expectedOwnerId,()=>storeKeyActionImpl(raw));}
export async function deleteKeyAction(provider:string,expectedOwnerId:string):Promise<ActionResult<null>>{return withAction(expectedOwnerId,()=>deleteKeyActionImpl(provider));}
export async function listStoredKeysAction(expectedOwnerId:string):Promise<ActionResult<KeyProvider[]>>{return withAction(expectedOwnerId,()=>listStoredKeysActionImpl());}
