/**
 * Core GEO types, ported from geo-radar-mcp/packages/shared and adapted so provider
 * API keys are passed per call (never read from process.env inside the pipeline).
 */

export type PanelistId = "openai" | "haiku" | "gemini" | "groq" | "perplexity" | "custom";

export type Sentiment = "positive" | "neutral" | "negative";

/**
 * Per-call provider keys. GetCited threads these through the whole pipeline so a
 * "We Serve" run uses our env keys and a "Self Serve" run uses the user's — the
 * measurement code itself never touches process.env.
 */
export interface ProviderKeys {
  openai?: string;
  /** Set only by trusted server credential resolution, never from a request. */
  shared?: boolean;
  anthropic?: string;
  gemini?: string;
  groq?: string;
  perplexity?: string;
  /**
   * Custom OpenAI-compatible panelist config, stored as a single JSON blob
   * `JSON.stringify({ baseURL, model, apiKey })` (no schema/DB change — reuses the
   * one-secret-per-provider slot). Parsed at build time in providers.panelistModel.
   */
  custom?: string;
}

export interface ShareOfVoiceEntry {
  brand: string;
  /** Answers that mentioned this brand. */
  mentions: number;
  /** Share of voice in [0,1] — this brand's mentions / all tracked mentions. */
  sov: number;
}

export interface PerPromptEntry {
  prompt: string;
  mentioned_brands: string[];
  top_competitor: string | null;
}

export interface MeasureInput {
  brand: string;
  brand_domains?: string[];
  competitors: string[];
  prompts?: string[];
  prompt_set_id?: string;
  panel?: PanelistId[];
  runs?: number;
}

export interface MeasureOutput {
  report_id: string;
  brand: string;
  status: "queued" | "completed";
  panel: string[];
  prompt_count: number;
  answer_count: number;
  share_of_voice: ShareOfVoiceEntry[];
  per_prompt: PerPromptEntry[];
  cost_usd: number;
  created_at: string;
  /** Set when a panelist (e.g. a misconfigured custom model) was skipped mid-run. */
  panel_warning?: string;
  parser_mode?: "deterministic" | "model";
  provenance?: "sample" | "live";
}
