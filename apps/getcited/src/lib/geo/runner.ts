import type { MeasureInput, MeasureOutput, PanelistId, ProviderKeys, Sentiment } from "./types";
import type { BeginRunParams, GeoStore, PersistedAnswer } from "./store";
import {
  PANELIST_MODELS,
  REAL_CALL_COST_ESTIMATE_USD,
  hasPanelistKey,
} from "./models";
import { createRealPanelist, createMockPanelist, type Panelist } from "./panelist";
import { createAnthropicParser, createDeterministicParser, type Parser } from "./parser";
import { computeShareOfVoice } from "./scoring";
import { CostMeter } from "./cost";
import { resolvePromptSet } from "./prompt-library";
import { PanelRunError } from "./errors";

/** Hard ceiling on LLM calls per run (prompts × runs × panelists). */
export const MAX_PANELIST_CALLS = 24;

export interface PanelRunner {
  run(input: MeasureInput): Promise<MeasureOutput>;
}

export interface RunPlan {
  prompts: string[];
  panel: string[];
  runs: number;
}

/** Resolve + validate prompts, panel, and the workload ceiling. Throws PanelRunError. */
export function planRun(input: MeasureInput): RunPlan {
  const prompts = resolvePrompts(input);
  const panel = resolvePanel(input);
  const runs = input.runs ?? 1;
  if(!Number.isInteger(runs)||runs<1||runs>3||!input.brand.trim()||input.brand.length>120||input.competitors.length>5||input.competitors.some(c=>!c.trim()||c.length>120)||prompts.some(p=>!p.trim()||p.length>4096)) throw new PanelRunError("Workload too large or invalid inputs", "workload_too_large");
  const panelistCalls = prompts.length * runs * panel.length;
  if (panelistCalls > MAX_PANELIST_CALLS) {
    throw new PanelRunError(
      `Workload too large: ${prompts.length} prompts × ${runs} runs × ${panel.length} panelists ` +
        `= ${panelistCalls} calls (max ${MAX_PANELIST_CALLS}). Reduce prompts, runs, or panel.`,
      "workload_too_large",
    );
  }
  return { prompts, panel, runs };
}

export function beginRunParams(input: MeasureInput, panel: string[]): BeginRunParams {
  return {
    brand: input.brand,
    brandDomains: input.brand_domains ?? [],
    competitors: input.competitors,
    panel,
  };
}

function resolvePrompts(input: MeasureInput): string[] {
  if (input.prompts && input.prompts.length > 0) return input.prompts;
  if (input.prompt_set_id) {
    const set = resolvePromptSet(input.prompt_set_id);
    if (!set) {
      throw new PanelRunError(
        `Unknown prompt_set_id "${input.prompt_set_id}". Built-in sets: demo.`,
        "no_prompts",
      );
    }
    return set.prompts;
  }
  throw new PanelRunError("No prompts provided (need `prompts` or `prompt_set_id`).", "no_prompts");
}

function resolvePanel(input: MeasureInput): string[] {
  const panel = input.panel && input.panel.length > 0 ? input.panel : ["openai"];
  const valid = Object.keys(PANELIST_MODELS);
  for (const id of panel) {
    if (!valid.includes(id)) {
      throw new PanelRunError(`Unknown panelist "${id}". Available: ${valid.join(", ")}.`, "unknown_panelist");
    }
  }
  return panel;
}

export interface RunnerOptions {
  costCapUsd: number;
  /** Per-user provider keys. A panelist runs for real only if its key is present. */
  keys: ProviderKeys;
  /** Force the deterministic mock pipeline (tests / landing free audit). */
  forceMock?: boolean;
  /** Override the per-call cost estimate (USD). Defaults to 0 for mock, ~$0.01 for real. */
  estimatePerCallUsd?: number;
  parserMode?: "deterministic" | "model";
  maxOutputTokens?: number;
}

/**
 * Runs a panel synchronously in-process. Ported from geo-radar's InProcessPanelRunner,
 * adapted so provider keys come from RunnerOptions.keys (per user) instead of env.
 */
export class InProcessPanelRunner implements PanelRunner {
  constructor(
    private readonly store: GeoStore,
    private readonly opts: RunnerOptions,
  ) {}

  async run(input: MeasureInput): Promise<MeasureOutput> {
    const { prompts, panel, runs } = planRun(input);
    const keys = this.opts.keys;
    const forceMock = this.opts.forceMock ?? false;
    const outputTokens = this.opts.maxOutputTokens ?? 600;
    if (!Number.isInteger(outputTokens) || outputTokens < 1 || outputTokens > 600) throw new PanelRunError("Output token limit must be 1–600", "workload_too_large");
    if (!forceMock && panel.some(id => !hasPanelistKey(id as PanelistId, keys))) throw new PanelRunError("A selected live model is not configured; no sample answers were substituted", "provider_error");
    const isMock = (): boolean => forceMock;
    const parserMock = forceMock || this.opts.parserMode !== "model";
    const anyRealCall = panel.some((id) => !isMock()) || !parserMock;

    const { runId } = await this.store.beginRun(beginRunParams(input, panel));

    try {
      // Unsupported custom configuration can be excluded before dispatch.
      // Once any provider is dispatched, failures stop the run without fallback.
      const panelWarnings: string[] = [];
      let customDisabled = false;
      const panelists = panel
        .map((id) => {
          if (isMock()) return createMockPanelist(id, input.brand, input.competitors);
          try {
            return createRealPanelist(id as PanelistId, keys, outputTokens);
          } catch (err) {
            if (id === "custom") {
              panelWarnings.push(customSkipWarning(err, keys.custom));
              customDisabled = true;
              return null;
            }
            throw err;
          }
        })
        .filter((p): p is Panelist => p !== null);
      if(!panelists.length) throw new PanelRunError("No supported live panelist is available", "provider_error");
      const parser: Parser = parserMock
        ? createDeterministicParser()
        : createAnthropicParser(keys);
      const meter = new CostMeter(this.opts.costCapUsd);
      const estimatePerCall =
        this.opts.estimatePerCallUsd ?? (anyRealCall ? REAL_CALL_COST_ESTIMATE_USD : 0);

      const persisted: PersistedAnswer[] = [];
      for (const prompt of prompts) {
        for (let r = 0; r < runs; r++) {
          for (const panelist of panelists) {
            if (panelist.id === "custom" && customDisabled) continue;
            if (meter.wouldExceed(estimatePerCall * 2)) {
              throw new PanelRunError(
                `Cost cap of $${this.opts.costCapUsd.toFixed(2)} would be exceeded; ` +
                  `aborted after $${meter.total.toFixed(4)}. Raise the cap or reduce prompts/panel/runs.`,
                "cost_cap_exceeded",
              );
            }
            const answer = await this.callPanelist(panelist, prompt);
            meter.add(answer.model, answer.usage);
            const parsed = await this.callParser(parser, answer.text, input);
            meter.add(parsed.model, parsed.usage);
            // Merge REAL provider sources (Perplexity) with text-extracted domains.
            const sourceDomains = answer.sources
              .map((u) => {
                try {
                  return new URL(u).host.replace(/^www\./, "").toLowerCase();
                } catch {
                  return null;
                }
              })
              .filter((d): d is string => Boolean(d));
            const citedDomains = Array.from(new Set([...parsed.citedDomains, ...sourceDomains]));
            persisted.push({
              model: answer.model,
              prompt,
              rawAnswer: answer.text,
              mentions: parsed.mentions,
              citedDomains,
              sentiment: parsed.sentiment,
            });
          }
        }
      }

      const scored = computeShareOfVoice({
        brand: input.brand,
        competitors: input.competitors,
        answers: persisted.map((a) => ({ prompt: a.prompt, mentions: a.mentions })),
      });
      const brandSov = scored.shareOfVoice.find((e) => e.brand === input.brand)?.sov ?? 0;
      const sentimentScore = averageSentiment(persisted.map((a) => a.sentiment));

      await this.store.finishRun(runId, {
        costUsd: meter.total,
        answers: persisted,
        sov: brandSov,
        sentimentScore,
        date: today(),
      });

      return {
        report_id: runId,
        brand: input.brand,
        status: "completed",
        panel,
        prompt_count: prompts.length,
        answer_count: persisted.length,
        share_of_voice: scored.shareOfVoice,
        per_prompt: scored.perPrompt,
        cost_usd: meter.total,
        parser_mode: parserMock ? "deterministic" : "model",
        provenance: forceMock ? "sample" : "live",
        created_at: new Date().toISOString(),
        ...(panelWarnings.length ? { panel_warning: panelWarnings[0] } : {}),
      };
    } catch (err) {
      const message =
        err instanceof PanelRunError ? err.message : `panel run failed: ${errorMessage(err)}`;
      await this.store.failRun(runId, message);
      if (err instanceof PanelRunError) throw err;
      throw new PanelRunError(message, "provider_error");
    }
  }

  private async callPanelist(panelist: Panelist, prompt: string) {
    try {
      return await panelist.ask(prompt);
    } catch (err) {
      throw new PanelRunError(`Panelist "${panelist.id}" failed: ${errorMessage(err)}`, "provider_error");
    }
  }

  private async callParser(parser: Parser, text: string, input: MeasureInput) {
    try {
      return await parser.parse(text, { brand: input.brand, competitors: input.competitors });
    } catch (err) {
      throw new PanelRunError(`Answer parsing failed: ${errorMessage(err)}`, "provider_error");
    }
  }
}

function averageSentiment(sentiments: (Sentiment | null)[]): number | null {
  const values = sentiments
    .filter((s): s is Sentiment => s !== null)
    .map((s): number => (s === "positive" ? 1 : s === "negative" ? -1 : 0));
  if (values.length === 0) return null;
  return round4(values.reduce((a, b) => a + b, 0) / values.length);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function errorMessage(_err: unknown): string {
  return "Provider operation failed; no automatic retry. Usage may have been incurred.";
}

/**
 * Build the user-facing "custom model skipped" warning WITHOUT leaking the key.
 * @ai-sdk/openai-compatible surfaces the upstream endpoint's raw error body as the
 * exception message, and the base URL is user-controlled — a reflecting/hostile
 * endpoint can echo the `Authorization: Bearer <key>` header back. We know the exact
 * key (from the blob), so redact it verbatim, then belt-and-suspenders strip any
 * Bearer/sk- token. The blob may be unparseable at build time; that path's message
 * (from parseCustomConfig) never contains the blob, so it's safe.
 */
export function customSkipWarning(err: unknown, customBlob: string | undefined): string {
  let msg = err instanceof Error ? err.message : "Unsupported custom configuration";
  try {
    const key = (JSON.parse(customBlob ?? "{}") as { apiKey?: unknown }).apiKey;
    if (typeof key === "string" && key.length >= 4) msg = msg.split(key).join("***");
  } catch {
    // blob wasn't JSON — parseCustomConfig's message doesn't include it; nothing to redact
  }
  msg = msg.replace(/Bearer\s+[\w.\-]+/gi, "Bearer ***").replace(/sk-[A-Za-z0-9\-_]{6,}/g, "sk-***");
  return `Custom model skipped: ${msg}`;
}
