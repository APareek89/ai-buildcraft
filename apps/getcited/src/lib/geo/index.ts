// Ported GEO measurement pipeline (from geo-radar-mcp), adapted for per-user keys.
export * from "./types";
export {
  PANELIST_MODELS,
  MODEL_PRICING,
  PARSER_MODEL_ID,
  PARSER_PROVIDER,
  REAL_CALL_COST_ESTIMATE_USD,
  hasAnthropicKey,
  hasPanelistKey,
  providerFor,
  type Provider,
  type PanelistModel,
} from "./models";
export {
  type Panelist,
  type PanelAnswer,
  type TokenUsage,
  createRealPanelist,
  createMockPanelist,
} from "./panelist";
export {
  type Parser,
  type ParsedResult,
  type ParseContext,
  createAnthropicParser,
  createDeterministicParser,
} from "./parser";
export { computeShareOfVoice, type ScoringInput, type ScoringResult, type ScoringAnswer } from "./scoring";
export { CostMeter } from "./cost";
export { BUILTIN_PROMPT_SETS, resolvePromptSet, type PromptSet } from "./prompt-library";
export {
  computeCitations,
  computeSentiment,
  type AnalysisAnswer,
  type CitationsResult,
  type SentimentResult,
  type CitedDomainEntry,
} from "./analysis";
export { PanelRunError } from "./errors";
export {
  InProcessPanelRunner,
  planRun,
  beginRunParams,
  MAX_PANELIST_CALLS,
  type PanelRunner,
  type RunPlan,
  type RunnerOptions,
} from "./runner";
export {
  type GeoStore,
  type PersistedAnswer,
  type BeginRunParams,
  type BeginRunResult,
  type FinishRunParams,
  type StoredReport,
} from "./store";
export { MemoryGeoStore } from "./memory-store";
export { buildReport, type FullReport } from "./report";
// Pure scoring engine (spec §4) — safe for client + server.
export * from "./tactics";
export {
  categorizeSource,
  buildCitationProfile,
  emptyProfile,
  computeGap,
  allocatePlan,
  projectImpact,
  PRODUCTIVE_HOURS_PER_WEEK,
  LIFT_TO_SHARE,
  MAX_SHARE_GAIN,
  SHARE_CAP,
  DEFAULT_ASSUMPTIONS,
  type CitationProfile,
  type Gap,
  type AllocateInput,
  type ChosenTactic,
  type AllocationResult,
  type Confidence,
  type Grounding,
  type ProjectImpactInput,
  type Projection,
} from "./plan";
// NOTE: `./keys`, `./crawl`, `./assist`, `./agent` are server-only — import them
// directly (e.g. "@/lib/geo/crawl") in server code. They are intentionally NOT
// re-exported here so client components can import from "@/lib/geo" safely.
