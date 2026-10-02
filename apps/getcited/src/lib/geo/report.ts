import type { GeoStore } from "./store";
import { computeShareOfVoice } from "./scoring";
import type { ShareOfVoiceEntry, PerPromptEntry, Sentiment } from "./types";

export interface FullReport {
  report_id: string;
  prepared: boolean;
  status: string;
  brand: string;
  panel: string[];
  cost_usd: number;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  share_of_voice: ShareOfVoiceEntry[];
  per_prompt: PerPromptEntry[];
  answers: {
    model: string;
    prompt: string;
    raw_answer: string;
    mentions: string[];
    cited_domains: string[];
    sentiment: Sentiment | null;
  }[];
}

/**
 * Assemble a full report from stored rows, recomputing share-of-voice from the
 * persisted answers (single source of truth — no cached summary to drift).
 */
export async function buildReport(store: GeoStore, runId: string): Promise<FullReport | null> {
  const stored = await store.getReport(runId);
  if (!stored) return null;

  const scored = computeShareOfVoice({
    brand: stored.brand,
    competitors: stored.competitors,
    answers: stored.answers.map((a) => ({ prompt: a.prompt, mentions: a.mentions })),
  });

  return {
    report_id: stored.run.id,
    prepared: Boolean(stored.run.prepared),
    status: stored.run.status,
    brand: stored.brand,
    panel: stored.run.panel,
    cost_usd: stored.run.costUsd,
    created_at: stored.run.createdAt,
    completed_at: stored.run.completedAt,
    error: stored.run.error,
    share_of_voice: scored.shareOfVoice,
    per_prompt: scored.perPrompt,
    answers: stored.answers.map((a) => ({
      model: a.model,
      prompt: a.prompt,
      raw_answer: a.rawAnswer,
      mentions: a.mentions,
      cited_domains: a.citedDomains,
      sentiment: a.sentiment,
    })),
  };
}
