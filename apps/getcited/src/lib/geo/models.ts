import type { PanelistId, ProviderKeys } from "./types";

export type Provider = "openai" | "anthropic" | "google" | "groq" | "perplexity" | "custom";

export interface PanelistModel {
  provider: Provider;
  modelId: string;
  label: string;
  /** Which ProviderKeys field this panelist needs. */
  keyField: keyof ProviderKeys;
}

/**
 * Panelist registry. Each panelist runs for real only when its provider key is
 * present in trusted per-call ProviderKeys. Missing live keys fail closed;
 * samples must explicitly select the deterministic mock.
 */
export const PANELIST_MODELS: Record<PanelistId, PanelistModel> = {
  openai: {provider: "openai", modelId: "gpt-4o-mini", label: "GPT-4o mini", keyField: "openai"},
  haiku: {
    provider: "anthropic",
    modelId: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    keyField: "anthropic",
  },
  gemini: {
    provider: "google",
    modelId: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite (BYOK)",
    keyField: "gemini",
  },
  groq: {
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B (retired; unavailable)",
    keyField: "groq",
  },
  perplexity: {
    provider: "perplexity",
    modelId: "sonar",
    label: "Perplexity Sonar (legacy; unavailable)",
    keyField: "perplexity",
  },
  custom: {
    provider: "custom",
    // modelId is dynamic for the custom panelist: the real model id is read from the
    // JSON blob (keys.custom → { baseURL, model, apiKey }) at build time in
    // providers.panelistModel. This registry value is intentionally unused.
    modelId: "",
    label: "Custom model",
    keyField: "custom",
  },
};

/** Default optional model parser; ordinary benchmarks use the deterministic parser. */
export const PARSER_MODEL_ID = "gpt-4o-mini";
export const PARSER_PROVIDER: Provider = "openai";

/** Verified configured rates used for report estimates. Durable usage also records returned model. */
export const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number; cachedPerM:number }> = {
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.60, cachedPerM:0.075 },
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10, cachedPerM:1.25 },
  "claude-haiku-4-5": { inputPerM: 1.0, outputPerM: 5.0, cachedPerM:0.1 },
  "claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0, cachedPerM:0.3 },
  "gemini-2.5-flash-lite": { inputPerM: 0.1, outputPerM: 0.4, cachedPerM:0.01 },
};

/** Rough per-call cost estimate (USD) used to abort BEFORE spending near the cap. */
export const REAL_CALL_COST_ESTIMATE_USD = 0.01;

/** Is the Anthropic key present in the given per-call keys? */
export function hasAnthropicKey(keys: ProviderKeys): boolean {
  return Boolean(keys.anthropic);
}

/** Is the key for this panelist's provider present in the given per-call keys? */
export function hasPanelistKey(id: PanelistId, keys: ProviderKeys): boolean {
  return Boolean(keys[PANELIST_MODELS[id].keyField]);
}

/** The upstream provider a panelist calls (rate-limit bucket key). */
export function providerFor(id: PanelistId): Provider {
  return PANELIST_MODELS[id].provider;
}
