import { q } from "./db";
import { polishImage, generateReel, generateImagePost } from "./mediaai";
import { generateProductCopy, reelPrompts, refineReelPrompt, type BusinessBasics } from "./claude";
import { getMedia, absoluteMediaUrl } from "./media";
import { generateAndSaveHero, generateProductImage } from "./imagery";
import { IMPORT_GEN_BUDGET } from "./quota";

/**
 * In-process async workers. Render runs a persistent Node server, so fire-and-forget
 * promises keep running after the response is sent; the client polls for status.
 */

const SUPPORTED_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function processProductPhoto(
  productId: string,
  mediaId: string,
  biz: BusinessBasics & { id: string; category: string }
): void {
  (async () => {
    try {
      const media = await getMedia(mediaId);
      if (!media) throw new Error("media missing");
      const mime = SUPPORTED_MIMES.has(media.mime) ? media.mime : "image/jpeg";
      const dataUri = `data:${mime};base64,${media.bytes.toString("base64")}`;
      const publicUrl = absoluteMediaUrl(mediaId);

      const [polishedUrl, copy] = await Promise.all([
        polishImage(dataUri, publicUrl, biz.category),
        generateProductCopy({ mime, base64: media.bytes.toString("base64") }, biz).catch(() => ({
          title: "New item",
          description: "",
          tags: [] as string[],
          category: "",
        })),
      ]);

      await q(
        `update jhalak.products set processed_url=$1, title=$2, description=$3, tags=$4, category=$5, status='ready' where id=$6`,
        [polishedUrl || "", copy.title, copy.description, copy.tags, copy.category || "", productId]
      );
    } catch (e) {
      await q(`update jhalak.products set status='failed', error=$1 where id=$2`, [
        e instanceof Error ? e.message : String(e),
        productId,
      ]).catch(() => {});
    }
  })();
}

/**
 * Import path: generate a whole site's imagery — hero first, then one image per
 * product — STRICTLY SEQUENTIALLY (never Promise.all). Each Gemini result is buffered
 * before persisting; on the 512MB instance a parallel burst OOMs (see Learning.MD
 * 2026-07-23). Budget is enforced per-generation inside imagery.ts (quota.ts), so
 * this loop naturally stops spending once the cap is hit — remaining products keep
 * their branded placeholder tile. Fire-and-forget; products poll to 'ready'.
 */
export function generateSiteImagery(
  bizId: string,
  biz: BusinessBasics,
  typeLabel: string,
  heroContent: { headline?: string; tagline?: string; about?: string },
  products: { id: string; title: string; description: string; category: string }[]
): void {
  (async () => {
    try {
      await generateAndSaveHero(bizId, { name: biz.name, category: biz.category, city: biz.city }, heroContent, typeLabel, IMPORT_GEN_BUDGET);
    } catch (e) {
      console.error("[imagery] hero:", e instanceof Error ? e.message : e);
    }
    for (const p of products) {
      let url: string | null = null;
      try {
        url = await generateProductImage(bizId, p, biz, IMPORT_GEN_BUDGET);
      } catch (e) {
        console.error("[imagery] product:", e instanceof Error ? e.message : e);
      }
      // mark ready either way (empty url → placeholder tile, never a broken image)
      await q(`update jhalak.products set processed_url=$1, status='ready' where id=$2`, [url || "", p.id]).catch(() => {});
    }
  })();
}

export function generateReelPack(
  businessId: string,
  product: { id: string; title: string; description: string; image_media_id: string },
  biz: BusinessBasics,
  brief?: string,
  kind: "video" | "image" = "video"
): void {
  const prompts = reelPrompts(product, biz, brief);
  prompts.forEach(({ variant, prompt }) => {
    (async () => {
      // when the owner gave direction, let Claude turn it into a tight generation prompt
      let genPrompt = prompt;
      if (brief?.trim()) {
        const refined = await refineReelPrompt(brief, product, biz, variant, kind);
        if (refined) genPrompt = refined;
      }
      const rows = await q<{ id: string }>(
        `insert into jhalak.reels (business_id, product_id, variant, prompt, kind) values ($1,$2,$3,$4,$5) returning id`,
        [businessId, product.id, variant, genPrompt, kind]
      );
      const reelId = rows[0].id;
      try {
        const media = await getMedia(product.image_media_id);
        if (!media) throw new Error("image missing");
        const mime = SUPPORTED_MIMES.has(media.mime) ? media.mime : "image/jpeg";
        const dataUri = `data:${mime};base64,${media.bytes.toString("base64")}`;
        const url = kind === "image"
          ? await generateImagePost(dataUri, absoluteMediaUrl(product.image_media_id), genPrompt)
          : await generateReel(dataUri, absoluteMediaUrl(product.image_media_id), genPrompt);
        await q(`update jhalak.reels set status='ready', video_url=$1 where id=$2`, [url, reelId]);
      } catch (e) {
        await q(`update jhalak.reels set status='failed', error=$1 where id=$2`, [
          e instanceof Error ? e.message : String(e),
          reelId,
        ]).catch(() => {});
      }
    })();
  });
}
