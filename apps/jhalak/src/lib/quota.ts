import { q } from "./db";

/**
 * AI image-generation budget. Each t2i/edit call costs money, so every generation
 * must reserve a slot BEFORE the provider is called. The site-creation burst is
 * additionally capped at IMPORT_GEN_BUDGET by the orchestrator; GEN_CAP is the
 * lifetime backstop (leaves room for later Studio regenerations).
 */
export const GEN_CAP = 24;          // lifetime hard cap per business
export const IMPORT_GEN_BUDGET = 8; // max generations spent in one create/import burst

/**
 * Atomically reserve ONE generation slot. Returns true if granted (under cap),
 * false if the business has hit its lifetime cap. Safe under concurrency: the
 * conditional upsert is a single statement, and Postgres re-checks the WHERE
 * against the locked row version on write.
 */
export async function reserveGeneration(bizId: string, cap = GEN_CAP): Promise<boolean> {
  const rows = await q<{ gens_used: number }>(
    `insert into jhalak.quotas (business_id, gens_used) values ($1, 1)
     on conflict (business_id) do update set gens_used = jhalak.quotas.gens_used + 1
       where jhalak.quotas.gens_used < $2
     returning gens_used`,
    [bizId, cap]
  );
  return rows.length > 0;
}

/**
 * Release a previously-reserved slot when the generation ultimately failed (provider
 * error / no output). Reserve-before-call keeps the budget a hard ceiling; this refund
 * means a Gemini outage doesn't permanently burn the owner's whole image allowance.
 */
export async function releaseGeneration(bizId: string): Promise<void> {
  await q(
    `update jhalak.quotas set gens_used = gens_used - 1 where business_id=$1 and gens_used > 0`,
    [bizId]
  ).catch(() => {});
}

/** How many generations this business has already spent. */
export async function gensUsed(bizId: string): Promise<number> {
  const rows = await q<{ gens_used: number }>(
    `select gens_used from jhalak.quotas where business_id=$1`,
    [bizId]
  );
  return rows[0]?.gens_used || 0;
}
