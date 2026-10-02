import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | undefined;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface SiteCopy {
  headline: string;
  tagline: string;
  about: string;
  services: { title: string; desc: string }[];
  cta_label: string;
}

export interface BusinessBasics {
  name: string;
  category: string;
  city: string;
  language: string; // 'english' | 'hinglish'
}

const LANGUAGE_NOTE: Record<string, string> = {
  english: "Write in clear, warm Indian English.",
  hinglish:
    "Write in Hinglish — natural Hindi-English mix as spoken by Indian small business owners (Roman script, e.g. 'Aapke liye', 'sabse behtar'). Keep it classy, not cringe.",
};

/** Generate website copy from the 3-question interview. Tool-forced JSON. */
export async function generateSiteCopy(
  biz: BusinessBasics,
  answers: { offering: string; special: string; action: string },
  referenceText?: string
): Promise<SiteCopy> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    tools: [
      {
        name: "save_copy",
        description: "Save the generated website copy",
        input_schema: {
          type: "object" as const,
          properties: {
            headline: { type: "string", description: "Hero headline, max 8 words, no business name" },
            tagline: { type: "string", description: "One supporting line under the headline, max 16 words" },
            about: { type: "string", description: "About section, 2-3 warm sentences, first person plural" },
            services: {
              type: "array",
              description: "Exactly 3 items",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "2-4 words" },
                  desc: { type: "string", description: "One sentence" },
                },
                required: ["title", "desc"],
              },
            },
            cta_label: { type: "string", description: "Button label, 2-4 words, action-oriented" },
          },
          required: ["headline", "tagline", "about", "services", "cta_label"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "save_copy" },
    messages: [
      {
        role: "user",
        content: `You are writing website copy for an Indian small business. The website's job is to make the business look premium, credible and modern — it is their statement of quality. Customers contact them on WhatsApp or by phone; there is no online checkout.

Business: ${biz.name} — a ${biz.category} in ${biz.city || "India"}.
What they offer: ${answers.offering}
What makes them special: ${answers.special}
What they want visitors to do: ${answers.action}
${referenceText ? `\nReference material the owner shared (their old website / brochure — use it for facts, tone and specifics, do NOT copy it verbatim):\n"""${referenceText.slice(0, 4000)}"""\n` : ""}
${LANGUAGE_NOTE[biz.language] || LANGUAGE_NOTE.english}
Premium but warm. No clichés like "one stop shop" or "best in class". No emoji.`,
      },
    ],
  });
  const tool = res.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("no copy generated");
  return tool.input as unknown as SiteCopy;
}

export interface ProductCopy {
  title: string;
  description: string;
  tags: string[];
  category: string;
}

/** Generate catalogue title/description from the product image (vision, base64). */
export async function generateProductCopy(
  image: { mime: string; base64: string },
  biz: BusinessBasics
): Promise<ProductCopy> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 800,
    tools: [
      {
        name: "save_product",
        description: "Save catalogue copy for this item",
        input_schema: {
          type: "object" as const,
          properties: {
            title: { type: "string", description: "Item name, 2-5 words, specific to what is in the photo" },
            description: { type: "string", description: "1-2 appealing sentences about this item" },
            tags: { type: "array", items: { type: "string" }, description: "3-5 short lowercase tags" },
            category: { type: "string", description: "ONE short category this item belongs to, e.g. 'Sarees', 'Lehengas', 'Jewellery', 'Hair', 'Skin', 'Interiors'. Title Case, 1-2 words." },
          },
          required: ["title", "description", "tags", "category"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "save_product" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: image.base64,
            },
          },
          {
            type: "text",
            text: `This photo is from ${biz.name}, a ${biz.category} in ${biz.city || "India"}. Write catalogue copy for it. If it is a product, describe the product. If it is a space or service (salon interior, clinic, gym), title it as the service/facility. ${LANGUAGE_NOTE[biz.language] || LANGUAGE_NOTE.english} No emoji.`,
          },
        ],
      },
    ],
  });
  const tool = res.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("no product copy generated");
  return tool.input as unknown as ProductCopy;
}

/** Build the two reel-variant prompts for a product. `brief` = user/inspiration direction. */
export function reelPrompts(
  product: { title: string; description: string },
  biz: BusinessBasics,
  brief?: string
): { variant: string; prompt: string }[] {
  const direction = brief?.trim()
    ? `Creative direction from the owner: ${brief.trim()}. `
    : "";
  return [
    {
      variant: "showcase",
      prompt: `${direction}Slow cinematic showcase of ${product.title} from ${biz.name}. The camera drifts gently around the subject, soft premium studio lighting, shallow depth of field, elegant and calm, Instagram reel style. ${product.description}`,
    },
    {
      variant: "promo",
      prompt: `${direction}Energetic promotional reel moment for ${product.title} at ${biz.name}, a ${biz.category} in ${biz.city || "India"}. Warm inviting light, subtle camera push-in, aspirational lifestyle feel, Instagram reel style. ${product.description}`,
    },
  ];
}

/** Turn the owner's brief + product into a tight generation prompt. Falls back to null. */
export async function refineReelPrompt(
  brief: string,
  product: { title: string; description: string },
  biz: BusinessBasics,
  variant: string,
  kind: "video" | "image"
): Promise<string | null> {
  try {
    const res = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Write ONE ${kind === "video" ? "AI video-generation prompt (image-to-video, 6s, 9:16 vertical)" : "AI image-generation prompt (9:16 vertical Instagram creative)"} for this Instagram ${kind === "video" ? "reel" : "post"}.

Business: ${biz.name}, a ${biz.category} in ${biz.city || "India"}.
Product in the source image: ${product.title}. ${product.description}
Owner's creative direction (FOLLOW THIS CLOSELY — it is the whole point): ${brief}
Variant style: ${variant === "showcase" ? "calm premium showcase" : "energetic promo"}.

Rules: describe concrete visuals/motion/lighting/mood that realize the owner's direction with THIS product; no text overlays, no logos, no people's faces; one paragraph, max 60 words. Reply with ONLY the prompt.`,
      }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c as {text:string}).text).join(" ").trim();
    return text || null;
  } catch {
    return null;
  }
}
