import "server-only";
import { safePublicGet, publicUrl } from "./safe-network";
import { requireExecution } from "@/lib/server/execution";
import { categorizeSource } from "./plan";
import { robotsAllows } from "./robots";
import type { SourceType } from "./tactics";

/**
 * Citation crawler (build spec §5). For each cited/competitor/backlink URL: fetch
 * readable content, classify the source type, and extract simple signals (does it
 * mention you / the competitor). Firecrawl first (if FIRECRAWL_API_KEY), else a
 * plain fetch + lightweight readability. Respects robots.txt + a per-host rate limit.
 */

export interface CrawlResult {
  url: string;
  domain: string;
  sourceType: SourceType;
  title: string | null;
  excerpt: string | null;
  mentionsBrand: boolean;
  mentionsCompetitor: string | null;
  fetched: boolean;
  skippedReason?: string;
}

export interface CrawlOptions {
  ownedDomains?: string[];
  brandNames?: string[];
  competitors?: string[];
  maxUrls?: number;
  perHostDelayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
}

const DEFAULT_UA = "GetCitedBot/1.0 (+https://getcited.app/bot)";

function host(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── robots.txt (best-effort, per-host cache within a single crawl) ───────────
async function isAllowed(
  url: string,
  ua: string,
  robotsCache: Map<string, string | null>,
  timeoutMs: number,
): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const key = `${u.protocol}//${u.host}`;
  let body = robotsCache.get(key);
  if (body === undefined) {
    try {
      const res = await safePublicGet(`${key}/robots.txt`, {timeoutMs, maxBytes: 128_000});
      if(res.status === 404) body = "";
      else if(res.ok) body = res.text;
      else return false;
    } catch { return false; }
    robotsCache.set(key, body);
  }
  if (!body) return true; // no robots.txt → allowed
  return robotsAllows(body, u.pathname, ua);
}

// ── content extraction ───────────────────────────────────────────────────────
function extract(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]!.trim()) : null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title, text };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchReadable(url: string, _ua: string, timeoutMs: number): Promise<{title:string|null;text:string}> {
  const res = await safePublicGet(url, {timeoutMs, maxBytes:1_048_576, headers:{accept:"text/html,text/plain"}});
  if(!res.ok) throw Error(`Public page returned HTTP ${res.status}`);
  return extract(res.text);
}

/**
 * Crawl a set of cited URLs → CrawlResult[]. Sequential with a per-host delay so we
 * never hammer a single site; robots.txt is honored (disallowed URLs are skipped).
 */
export async function crawlCitations(urls: string[], opts: CrawlOptions = {}): Promise<CrawlResult[]> {
  const scope = requireExecution();
  if(scope.mode !== "live") return urls.slice(0,24).map(url=>({url,domain:host(url),sourceType:categorizeSource(url),title:null,excerpt:null,mentionsBrand:false,mentionsCompetitor:null,fetched:false,skippedReason:"Prepared example does not crawl websites"}));
  const ua = opts.userAgent ?? DEFAULT_UA;
  const timeoutMs = Math.min(opts.timeoutMs ?? 8000, 8000);
  const perHostDelayMs = opts.perHostDelayMs ?? 1000;
  const maxUrls = Math.max(0,Math.min(opts.maxUrls ?? 12,24));
  const owned = (opts.ownedDomains ?? []).map((d) => d.toLowerCase());
  const brandNames = (opts.brandNames ?? []).map((b) => b.toLowerCase());
  const competitors = opts.competitors ?? [];

  const unique = Array.from(new Set(urls.map((u) => (u.startsWith("http") ? u : `https://${u}`)))).slice(0, maxUrls);
  const robotsCache = new Map<string, string | null>();
  const lastHostHit = new Map<string, number>();
  const results: CrawlResult[] = [];

  for (const url of unique) {
    const h = host(url);
    const base: CrawlResult = {
      url,
      domain: h,
      sourceType: categorizeSource(url, { ownedDomains: owned }),
      title: null,
      excerpt: null,
      mentionsBrand: false,
      mentionsCompetitor: null,
      fetched: false,
    };

    // Rate limit per host.
    const last = lastHostHit.get(h);
    if (last) {
      const wait = perHostDelayMs - (Date.now() - last);
      if (wait > 0) await sleep(wait);
    }
    lastHostHit.set(h, Date.now());

    try {
      publicUrl(url);
      if (Date.now() >= scope.deadlineMs) throw Error("Crawl deadline exceeded");
      if (!(await isAllowed(url, ua, robotsCache, timeoutMs))) {
        results.push({ ...base, skippedReason: "robots.txt disallow" });
        continue;
      }
      const { title, text } = await fetchReadable(url, ua, timeoutMs);
      const lower = text.toLowerCase();
      base.title = title;
      base.excerpt = text.slice(0, 280);
      base.fetched = true;
      base.sourceType = categorizeSource(url, { title: title ?? undefined, ownedDomains: owned });
      base.mentionsBrand = brandNames.some((b) => lower.includes(b));
      base.mentionsCompetitor =
        competitors.find((c) => lower.includes(c.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, ""))) ??
        null;
    } catch (e) {
      base.skippedReason = e instanceof Error ? e.message : "fetch failed";
    }
    results.push(base);
  }

  return results;
}
