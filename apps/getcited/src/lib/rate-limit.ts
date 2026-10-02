import "server-only";

/**
 * Best-effort in-memory sliding-window rate limiter. FMEA #4: caps how often a single
 * user can trigger our-key Claude calls (suggest queries / discover competitors) so a
 * logged-in user can't burn our Anthropic credits. NOTE: in-memory means per-instance —
 * on serverless it's not a hard global cap; a durable limiter (Upstash/Postgres) can
 * replace this later without changing call sites. Still stops trivial spam.
 */
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
  remaining: number;
}

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (hits.length >= opts.limit) {
    const retryAfterMs = Math.max(0, hits[0]! + opts.windowMs - now);
    buckets.set(key, hits);
    return { ok: false, retryAfterMs, remaining: 0 };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= windowStart)) buckets.delete(k);
    }
  }

  return { ok: true, retryAfterMs: 0, remaining: opts.limit - hits.length };
}
