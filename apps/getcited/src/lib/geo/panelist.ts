import { generateText } from "ai";
import type { PanelistId, ProviderKeys } from "./types";
import { panelistModel, parseCustomConfig } from "./providers";
import { PANELIST_MODELS } from "./models";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?:number;
}

export interface PanelAnswer {
  model: string;
  text: string;
  usage: TokenUsage;
  /** REAL cited source URLs returned by web-grounded providers (Perplexity/Gemini). */
  sources: string[];
}

/** A single "AI search panelist" — asks a buyer-intent prompt, returns an answer. */
export interface Panelist {
  id: string;
  modelId: string;
  ask(prompt: string): Promise<PanelAnswer>;
}

const PANELIST_SYSTEM =
  "You are an AI search assistant. Answer the user's question helpfully and concisely. " +
  "Recommend specific products, brands, or companies by name, and where relevant mention the " +
  "websites you would cite.";

function normalizeUsage(u: { inputTokens?: number; outputTokens?: number; inputTokenDetails?:{cacheReadTokens?:number} } | undefined): TokenUsage {
  return { inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0, cachedInputTokens:u?.inputTokenDetails?.cacheReadTokens??0 };
}

/** Real panelist backed by a provider, built from per-call keys. */
export function createRealPanelist(id: PanelistId, keys: ProviderKeys, maxOutputTokens = 600): Panelist {
  // The custom panelist has no static registry modelId — derive its display/cost id
  // from the user's config blob so reports show the real model (not an empty string).
  const modelId =
    id === "custom" && keys.custom
      ? parseCustomConfig(keys.custom).model
      : PANELIST_MODELS[id].modelId;
  return {
    id,
    modelId,
    async ask(prompt: string): Promise<PanelAnswer> {
      const res = await generateText({
        model: panelistModel(id, keys),
        system: PANELIST_SYSTEM,
        prompt,
        maxOutputTokens,
        maxRetries: 0,
        experimental_telemetry: { isEnabled: false, functionId: `panelist.${id}` },
      });
      if (["length","content-filter","error"].includes(res.finishReason) || !res.text.trim()) throw Error("Provider returned incomplete or refused text; usage was recorded and no retry was made.");
      // Web-grounded providers (Perplexity sonar) return the ACTUAL cited pages as
      // sources — the evidence the plan is built on. Don't rely on text regex alone.
      const sources = (res.sources ?? [])
        .map((s) => ("url" in s && typeof s.url === "string" ? s.url : null))
        .filter((u): u is string => Boolean(u));
      return { model: modelId, text: res.text, usage: normalizeUsage(res.usage), sources };
    },
  };
}

/**
 * Deterministic mock panelist for offline tests / no-key local dev. It writes an
 * answer that names a subset of the tracked brands (plus fake domains) based on a
 * stable hash of the prompt, so the parser + scorer have real signal to work on.
 */
export function createMockPanelist(id: string, brand: string, competitors: string[]): Panelist {
  const pool = [brand, ...competitors];
  return {
    id,
    modelId: `mock:${id}`,
    async ask(prompt: string): Promise<PanelAnswer> {
      const h = hashString(`${prompt}::${id}`);
      const mentioned = pool.filter((_, i) => i === h % pool.length || ((h >> i) & 1) === 1);
      const picks = mentioned.length > 0 ? mentioned : [pool[0]!];
      const cites = picks
        .map((m) => `${m} (${m.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com)`)
        .join(", ");
      const text = `For "${prompt}", strong options I'd recommend include ${cites}. These are great, reliable choices.`;
      return { model: `mock:${id}`, text, usage: { inputTokens: 0, outputTokens: 0 }, sources: [] };
    },
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
