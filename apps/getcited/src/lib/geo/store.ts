import type { Sentiment } from "./types";

/** One persisted panel answer. */
export interface PersistedAnswer {
  model: string;
  prompt: string;
  rawAnswer: string;
  mentions: string[];
  citedDomains: string[];
  sentiment: Sentiment | null;
}

export interface BeginRunParams {
  brand: string;
  brandDomains: string[];
  competitors: string[];
  panel: string[];
  configId?: string | null;
}

export interface BeginRunResult {
  runId: string;
}

export interface FinishRunParams {
  costUsd: number;
  answers: PersistedAnswer[];
  /** Brand's share of voice for this run (for sov_history). */
  sov: number;
  sentimentScore: number | null;
  /** YYYY-MM-DD run date. */
  date: string;
  configId?: string | null;
}

export interface StoredReport {
  run: {
    id: string;
    prepared?: boolean;
    status: string;
    panel: string[];
    costUsd: number;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  };
  brand: string;
  competitors: string[];
  brandDomains: string[];
  answers: PersistedAnswer[];
}

/**
 * Persistence boundary for panel runs. The in-process runner writes through this
 * so the same runner works with an in-memory store (tests / landing mock) or the
 * Supabase-backed store (real runs, scoped by user_id).
 */
export interface GeoStore {
  beginRun(params: BeginRunParams): Promise<BeginRunResult>;
  finishRun(runId: string, params: FinishRunParams): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
  getReport(runId: string): Promise<StoredReport | null>;
}
