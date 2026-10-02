import "server-only";
import type { ProviderKeys } from "./types";

/**
 * "We Serve" provider keys read from server env. Used when a user is on our infra.
 * NEVER import this into client code, and never log the returned values.
 */
export function serverProviderKeys(): ProviderKeys {
  return {
    shared: true,
    openai: process.env.OPENAI_API_KEY || undefined,
    anthropic: process.env.ANTHROPIC_API_KEY || undefined,
    gemini: process.env.GEMINI_API_KEY || undefined,
    groq: process.env.GROQ_API_KEY || undefined,
    perplexity: process.env.PERPLEXITY_API_KEY || undefined,
    // Optional We-Serve custom panelist: a JSON blob {baseURL, model, apiKey}.
    custom: process.env.CUSTOM_MODEL_CONFIG || undefined,
  };
}

/**
 * Merge user-supplied (Self Serve) keys over the server defaults. Any key the user
 * provides wins; anything they omit falls back to our env (when in We Serve).
 */
export function mergeKeys(base: ProviderKeys, override?: Partial<ProviderKeys>): ProviderKeys {
  if (!override) return base;
  return {
    shared: override.shared === false ? false : base.shared,
    openai: override.openai || base.openai,
    anthropic: override.anthropic || base.anthropic,
    gemini: override.gemini || base.gemini,
    groq: override.groq || base.groq,
    perplexity: override.perplexity || base.perplexity,
    custom: override.custom || base.custom,
  };
}

/** How many panelists could run for real given these keys (for UX hints). */
export function realPanelistCount(keys: ProviderKeys): number {
  return [keys.openai, keys.anthropic, keys.gemini, keys.groq, keys.perplexity, keys.custom].filter(Boolean)
    .length;
}

/** The panel cost cap (USD) from env, defaulting to $1.00. */
export function costCapUsd(): number {
  const raw = Number(process.env.PANEL_COST_CAP_USD_PER_RUN);
  return Number.isFinite(raw) && raw > 0 ? raw : 1.0;
}
