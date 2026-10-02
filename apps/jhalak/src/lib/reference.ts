import Anthropic from "@anthropic-ai/sdk";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_HTML_BYTES = 2_000_000; // hard cap — never buffer a big page on the 512MB instance
const MAX_REDIRECTS = 4;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** Strip tags/entities from raw HTML down to readable text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True for loopback / private / link-local / metadata / CGNAT addresses (SSRF guard). */
function ipBlocked(ip: string): boolean {
  const v = ip.startsWith("::ffff:") ? ip.slice(7) : ip; // unwrap IPv4-mapped IPv6
  if (net.isIPv4(v)) {
    const [a, b] = v.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lo = ip.toLowerCase();
  return lo === "::1" || lo === "::" || lo.startsWith("fe80") || lo.startsWith("fc") || lo.startsWith("fd");
}

/** Reject non-http(s) schemes, odd ports, and any host that resolves to a private/internal IP. */
async function assertPublicHost(u: URL): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("blocked scheme");
  if (!ALLOWED_PORTS.has(u.port)) throw new Error("blocked port");
  const host = u.hostname;
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(ipBlocked)) throw new Error("blocked host");
}

/**
 * Fetch a URL's text with an SSRF guard (validated on every redirect hop) and a hard
 * byte cap (streamed, never r.text()). Returns "" if blocked/failed. This is the only
 * server-side fetch of an owner-supplied URL, so it must be safe on both fronts.
 */
async function safeFetchText(startUrl: string): Promise<string> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(url);
    await assertPublicHost(u); // re-validate each hop — a public URL can 302 to an internal IP
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JhalakBot/1.0)" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) return "";
      url = new URL(loc, u).toString();
      continue;
    }
    if (!r.ok || !r.body) return "";
    if (Number(r.headers.get("content-length") || 0) > MAX_HTML_BYTES) return "";
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_HTML_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(Math.min(total, MAX_HTML_BYTES));
    let off = 0;
    for (const c of chunks) {
      if (off + c.length > buf.length) { buf.set(c.subarray(0, buf.length - off), off); break; }
      buf.set(c, off);
      off += c.length;
    }
    return new TextDecoder().decode(buf);
  }
  return "";
}

/** JS-rendered sites (Wix, Hostinger Horizons, etc.) ship empty HTML shells —
 *  reconstruct their content from the search index via Claude's web_search tool. */
export async function researchSiteViaWeb(url: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const host = new URL(url).hostname.replace(/^www\./, "");
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1800,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as unknown as Anthropic.Tool],
    messages: [{
      role: "user",
      content: `Research the business behind the website ${url} (search "site:${host}" and the business name). Write a factual reference document covering: business name, what they offer (products/services with specifics), who they serve, unique strengths, locations/contact details, and their tone of voice. Plain text only, facts only — this will seed a new website for the same business.`,
    }],
  });
  return res.content.filter((c) => c.type === "text").map((c) => (c as Anthropic.TextBlock).text).join("\n");
}

/**
 * Read a URL down to a plain-text reference. Tries a guarded, size-capped direct fetch
 * first; if the page is a JS-rendered shell (or the fetch is blocked/failed),
 * reconstructs the content from the web index. Returns the text and which path produced it.
 */
export async function readReferenceFromUrl(
  url: string
): Promise<{ text: string; source: "url" | "web-research" }> {
  let text = "";
  let via: "url" | "web-research" = "url";
  try {
    text = stripHtml(await safeFetchText(url));
  } catch {
    // network/timeout/blocked-host/too-large — fall through to web research
  }
  if (text.replace(/\s+/g, " ").trim().length < 200) {
    text = await researchSiteViaWeb(url);
    via = "web-research";
  }
  return { text, source: via };
}
