import type {
  GeoStore,
  BeginRunParams,
  BeginRunResult,
  FinishRunParams,
  StoredReport,
} from "./store";

interface MemRun {
  id: string;
  status: string;
  panel: string[];
  costUsd: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  brand: string;
  competitors: string[];
  brandDomains: string[];
  answers: StoredReport["answers"];
}

/**
 * In-memory GeoStore for tests, offline mock runs, and the landing-page free audit
 * (no persistence needed there). Deterministic ids so tests can assert on them.
 */
export class MemoryGeoStore implements GeoStore {
  private runs = new Map<string, MemRun>();
  private seq = 0;

  async beginRun(params: BeginRunParams): Promise<BeginRunResult> {
    const runId = `run_${++this.seq}`;
    this.runs.set(runId, {
      id: runId,
      status: "running",
      panel: params.panel,
      costUsd: 0,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      brand: params.brand,
      competitors: params.competitors,
      brandDomains: params.brandDomains,
      answers: [],
    });
    return { runId };
  }

  async finishRun(runId: string, params: FinishRunParams): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = "completed";
    run.costUsd = params.costUsd;
    run.completedAt = new Date().toISOString();
    run.answers = params.answers;
  }

  async failRun(runId: string, error: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = "failed";
    run.error = error;
    run.completedAt = new Date().toISOString();
  }

  async getReport(runId: string): Promise<StoredReport | null> {
    const run = this.runs.get(runId);
    if (!run) return null;
    return {
      run: {
        id: run.id,
        status: run.status,
        panel: run.panel,
        costUsd: run.costUsd,
        error: run.error,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
      },
      brand: run.brand,
      competitors: run.competitors,
      brandDomains: run.brandDomains,
      answers: run.answers,
    };
  }
}
