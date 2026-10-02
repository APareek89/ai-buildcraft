import { q } from "./db";
import { generateImage } from "./mediaai";
import { reserveGeneration, releaseGeneration } from "./quota";
import type { BusinessBasics } from "./claude";

/**
 * Grounded AI imagery for owners who have no photos. Every generation reserves a
 * budget slot BEFORE calling the provider (quota.ts), so a burst can never exceed
 * the business cap. Callers MUST invoke these sequentially (await in a loop) — each
 * Gemini result is buffered in memory before persisting and the instance has 512MB.
 */

// flux/schnell readily bakes garbled text into images unless pushed hard — keep this
// blunt and repetitive (it's a distilled model with weak negative-prompt handling).
const NO_TEXT = "Unbranded and plain: absolutely NO text, no letters, no words, no numbers, no labels, no signage, no logos and no watermarks anywhere in the frame. Photorealistic, premium commercial photography, natural lighting, sharp focus, no people's faces.";

/** Wide hero image grounded in the business + its generated copy. `typeLabel` is a
 *  readable descriptor (e.g. "PET conveyor manufacturer") — falls back to category. */
export function heroImagePrompt(
  biz: { name: string; category: string; city: string },
  content: { headline?: string; tagline?: string; about?: string },
  typeLabel?: string
): string {
  const kind = (typeLabel || biz.category || "business").trim();
  const subject = content.about || content.tagline || content.headline || kind;
  return `Wide 16:9 hero photograph for the website of ${biz.name}, ${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}${
    biz.city ? ` based in ${biz.city}, India` : " in India"
  }. Scene should evoke: ${subject}. Editorial, aspirational, uncluttered composition with room for a headline. ${NO_TEXT}`;
}

/** Catalogue image grounded in one product/service's own description. */
export function productImagePrompt(
  item: { title: string; description?: string; category?: string },
  biz: { name: string; category: string }
): string {
  const isRetail = ["boutique", "retail", "store", "shop", "restaurant"].includes(biz.category);
  const detail = item.description ? ` ${item.description}` : "";
  if (isRetail) {
    return `Professional e-commerce catalogue photograph of "${item.title}".${detail} Centered on a clean, softly-lit neutral studio background with a gentle natural shadow. Premium product photography, high detail. ${NO_TEXT}`;
  }
  return `Professional photograph representing "${item.title}"${
    item.category ? ` (${item.category})` : ""
  } offered by ${biz.name}.${detail} Realistic in-context scene, clean and premium. ${NO_TEXT}`;
}

/**
 * Generate a hero image and store it on content.hero_image_url. Returns the
 * /api/media URL, or null if budget exhausted / generation failed (caller keeps
 * the gradient hero). Never throws.
 */
export async function generateAndSaveHero(
  bizId: string,
  biz: { name: string; category: string; city: string },
  content: { headline?: string; tagline?: string; about?: string },
  typeLabel?: string,
  cap?: number
): Promise<string | null> {
  if (!(await reserveGeneration(bizId, cap))) return null;
  const url = await generateImage(heroImagePrompt(biz, content, typeLabel), "hero");
  if (!url) { await releaseGeneration(bizId); return null; }
  await q(
    `insert into jhalak.site_content (business_id, content)
       values ($1, jsonb_build_object('hero_image_url', $2::text))
     on conflict (business_id) do update
       set content = jhalak.site_content.content || jsonb_build_object('hero_image_url', $2::text),
           updated_at = now()`,
    [bizId, url]
  );
  return url;
}

/**
 * Generate a catalogue image for a product from its description. Returns the
 * /api/media URL or null (budget/failure). Does not touch the DB — the caller
 * decides whether to create/update the product row.
 */
export async function generateProductImage(
  bizId: string,
  item: { title: string; description?: string; category?: string },
  biz: BusinessBasics,
  cap?: number
): Promise<string | null> {
  if (!(await reserveGeneration(bizId, cap))) return null;
  const url = await generateImage(productImagePrompt(item, biz), "square");
  if (!url) await releaseGeneration(bizId);
  return url;
}
