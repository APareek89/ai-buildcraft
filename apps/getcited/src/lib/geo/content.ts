import "server-only";
import type { ProviderKeys } from "./types";
import { generateText } from "ai";
import { defaultModel } from "./providers";

/**
 * GEO content drafts — turns a plan tactic into ready-to-publish content (the
 * "one-stop shop" piece): blog posts, comparison pages, Reddit answers, LinkedIn
 * posts, roundup/guest pitches, review-request emails. Used by the chat tool and
 * the MCP tool (parity).
 */

export const CONTENT_MODEL_ID = "claude-sonnet-4-6";

export const CONTENT_TYPES = [
  "blog_post",
  "comparison_page",
  "reddit_answer",
  "linkedin_post",
  "guest_post_pitch",
  "review_request_email",
  "youtube_brief",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

const STYLE: Record<ContentType, string> = {
  blog_post:
    "A 900–1300 word SEO/GEO-optimized blog post in markdown: H1, scannable H2s, a direct answer in the first 100 words (AI assistants quote openings), an FAQ section at the end, and a suggested meta title + description at the top as a fenced block.",
  comparison_page:
    'An "X vs Y" comparison page in markdown: H1, TL;DR verdict box first, a feature-by-feature table, "who should pick which" section, FAQ. Honest — concede where the competitor wins; credibility earns citations.',
  reddit_answer:
    "A genuinely helpful Reddit answer (120–250 words): plain-spoken, first-hand tone, answers the question fully BEFORE mentioning the brand once, no marketing language, no links unless natural. Include which subreddit(s) it fits.",
  linkedin_post:
    "A LinkedIn post (150–250 words): hook line, insight or data point, short story or example, soft CTA. No hashtag spam (max 3).",
  guest_post_pitch:
    "A guest-post / roundup-inclusion outreach email (~150 words): personalized opener placeholder, one-line value prop, 3 headline options, why their readers care. Subject line included.",
  review_request_email:
    "A review-request email to happy customers (~120 words): warm, specific to the product, one-click ask (G2/Capterra), sincere no-pressure close. Subject line included.",
  youtube_brief:
    "A creator sponsorship brief in markdown: video angle, 3 talking points, what to show on screen, required disclosure line, suggested title + thumbnail text.",
};

export async function generateContent(params: {
  keys: ProviderKeys;
  type: ContentType;
  topic: string;
  brand: string;
  brandUrl?: string;
  description?: string | null;
  competitors?: string[];
  queries?: string[];
  planContext?: string;
}): Promise<string> {
  const res = await generateText({
    model: defaultModel(params.keys),
    system:
      "You write GEO-optimized content: structured for AI assistants to quote (direct answers early, " +
      "clear headings, factual claims, FAQ blocks) while reading naturally for humans. Never fabricate " +
      "statistics, customer names, or reviews — use [PLACEHOLDER: …] where the team must fill real data. " +
      "Return ONLY the content in markdown, no preamble.",
    prompt:
      `Content type: ${params.type}\nFormat requirements: ${STYLE[params.type]}\n\n` +
      `Brand: ${params.brand}${params.brandUrl ? ` (${params.brandUrl})` : ""}\n` +
      (params.description ? `What they do: ${params.description}\n` : "") +
      (params.competitors?.length ? `Competitors: ${params.competitors.join(", ")}\n` : "") +
      (params.queries?.length
        ? `Buyer-intent queries the content should answer: ${params.queries.slice(0, 6).join(" · ")}\n`
        : "") +
      (params.planContext ? `Plan context: ${params.planContext}\n` : "") +
      `\nTopic / assignment: ${params.topic}`,
    maxOutputTokens: 3000,
    maxRetries: 0,
    experimental_telemetry: { isEnabled: false, functionId: "content" },
  });
  if (["length","content-filter","error"].includes(res.finishReason) || !res.text.trim()) throw Error("Provider returned incomplete or refused text; usage was recorded and no retry was made.");
  return res.text;
}
