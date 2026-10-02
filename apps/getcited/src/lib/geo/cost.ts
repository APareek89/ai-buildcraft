import { MODEL_PRICING } from "./models";
import type { TokenUsage } from "./panelist";

/**
 * Tracks cumulative USD spend for a panel run and enforces a hard cap. Explicit mock: models contribute $0. Unknown live models fail closed; this
 * report estimate complements the durable reservation ledger.
 */
export class CostMeter {
  private spentUsd = 0;

  constructor(private readonly capUsd: number) {}

  /** Would spending `estimateUsd` more push us over the cap? Check BEFORE each call. */
  wouldExceed(estimateUsd: number): boolean {
    return this.spentUsd + estimateUsd > this.capUsd;
  }

  add(modelId: string, usage: TokenUsage): void {
    const pricing = MODEL_PRICING[modelId];
    if (!pricing) { if(modelId.startsWith("mock:")) return; throw Error("Unpriced model cannot enter a live cost report"); }
    this.spentUsd +=
      ((usage.inputTokens-(usage.cachedInputTokens??0)) / 1_000_000) * pricing.inputPerM +
      ((usage.cachedInputTokens??0)/1_000_000)*pricing.cachedPerM +
      (usage.outputTokens / 1_000_000) * pricing.outputPerM;
  }

  get total(): number {
    return this.spentUsd;
  }

  get cap(): number {
    return this.capUsd;
  }
}
