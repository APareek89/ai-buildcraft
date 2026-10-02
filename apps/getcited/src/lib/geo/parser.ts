import { generateObject } from "ai";
import { z } from "zod";
import type { Sentiment } from "./types";
import { defaultModel } from "./providers";
import type { ProviderKeys } from "./types";
import type { TokenUsage } from "./panelist";

export interface ParseContext {
  brand: string;
  competitors: string[];
}

export interface ParsedResult {
  mentions: string[];
  citedDomains: string[];
  sentiment: Sentiment;
  usage: TokenUsage;
  model: string;
}

/** Turns a raw AI answer into structured mentions/citations/sentiment. */
export interface Parser {
  parse(answer: string, ctx: ParseContext): Promise<ParsedResult>;
}

const ParseObjectSchema = z.object({
  mentioned_brands: z
    .array(z.string())
    .describe("Which of the candidate brands are mentioned. Use candidate spellings exactly."),
  cited_domains: z.array(z.string()).describe("Any domains or website URLs cited in the answer."),
  sentiment: z
    .enum(["positive", "neutral", "negative"])
    .describe("Sentiment toward the PRIMARY brand when it is mentioned; neutral if absent."),
});

/** Optional structured parser using the configured, metered provider. */
export function createAnthropicParser(keys: ProviderKeys): Parser {
  return {
    async parse(answer: string, ctx: ParseContext): Promise<ParsedResult> {
      const candidates = [ctx.brand, ...ctx.competitors];
      const res = await generateObject({
        model: defaultModel(keys),
        schema: ParseObjectSchema,
        system:
          "You extract structured data from an AI assistant's answer. Only report brands from " +
          "the provided candidate list. Do not invent brands or domains.",
        prompt:
          `Primary brand: ${ctx.brand}\n` +
          `Candidate brands: ${candidates.join(", ")}\n\n` +
          `Answer to analyze:\n"""${answer}"""`,
        maxOutputTokens: 400,
        maxRetries: 0,
        experimental_telemetry: { isEnabled: false, functionId: "parser" },
      });
      const usage: TokenUsage = {
        inputTokens: res.usage?.inputTokens ?? 0,
        outputTokens: res.usage?.outputTokens ?? 0,
        cachedInputTokens:res.usage?.inputTokenDetails?.cacheReadTokens??0,
      };
      const allowed = new Set(candidates.map((c) => c.toLowerCase()));
      const mentions = res.object.mentioned_brands.filter((m) => allowed.has(m.toLowerCase()));
      return {
        mentions: canonicalize(mentions, candidates),
        citedDomains: dedupe(res.object.cited_domains.map((d) => d.toLowerCase())),
        sentiment: res.object.sentiment,
        usage,
        model:keys.openai?"gpt-4o-mini":"claude-haiku-4-5",
      };
    },
  };
}

/**
 * Deterministic parser: matches candidate brand names in the text, extracts
 * domain-shaped tokens, and applies keyword sentiment. No LLM — used for mock-mode
 * tests and as a dependable fallback.
 */
export function createDeterministicParser(): Parser {
  const POSITIVE = /\b(best|great|excellent|love|recommend|top|reliable|leading)\b/i;
  const NEGATIVE = /\b(bad|poor|worst|avoid|terrible|unreliable|scam)\b/i;
  const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z]{2,})+\b/gi;

  return {
    async parse(answer: string, ctx: ParseContext): Promise<ParsedResult> {
      const candidates = [ctx.brand, ...ctx.competitors];
      const lower = answer.toLowerCase();
      const mentions = candidates.filter((c) => lower.includes(c.toLowerCase()));
      const citedDomains = dedupe((answer.match(DOMAIN) ?? []).map((d) => d.toLowerCase()));
      const sentiment: Sentiment = POSITIVE.test(answer)
        ? "positive"
        : NEGATIVE.test(answer)
          ? "negative"
          : "neutral";
      return { mentions, citedDomains, sentiment, model:"mock:deterministic-parser", usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function canonicalize(matched: string[], candidates: string[]): string[] {
  const byLower = new Map(candidates.map((c) => [c.toLowerCase(), c]));
  return dedupe(matched.map((m) => byLower.get(m.toLowerCase()) ?? m));
}
