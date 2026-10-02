import Anthropic from "@anthropic-ai/sdk";
import type { Section } from "./tenant";
import { SECTION_TYPES } from "./tenant";

const MODEL = "claude-sonnet-4-6";
const KNOWN_CATEGORIES = ["boutique", "salon", "clinic", "gym", "restaurant", "other"] as const;
const BUILTIN_TAB_KEYS = ["products", "about", "gallery", "contact", "pricing", "terms", "faq"] as const;
export const MAX_IMPORT_PRODUCTS = 8;

export type ProductDraft = {
  title: string;
  description: string;
  category: string;
  price_text: string;
};

export type SiteDraft = {
  name: string;
  business_type: string; // readable descriptor used to ground image prompts
  category: string; // one of KNOWN_CATEGORIES (drives theme)
  city: string;
  phone: string;
  language: string; // english | hinglish
  headline: string;
  tagline: string;
  about: string;
  cta_label: string;
  services: { title: string; desc: string }[];
  products: ProductDraft[];
  tabs: string[]; // builtin tab keys to enable
  sections: Section[]; // proposed rich blocks (id + enabled assigned here)
};

// ---- normalization: turn the model's loose output into a validated SiteDraft ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function str(v: any, max = 400): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Models sometimes emit placeholder literals ("<UNKNOWN>", "N/A") for facts they
// can't find — strip these so they never leak into prompts or the live site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fact(v: any, max = 400): string {
  const s = str(v, max);
  return /^<?\s*(unknown|n\/?a|none|null|tbd|not\s*(specified|found|available|listed)|--+)\s*>?$/i.test(s) ? "" : s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSection(raw: any): Section | null {
  const type = raw?.type;
  if (!SECTION_TYPES.includes(type)) return null;
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const base = { id: type, enabled: true as const };
  // fact() (not str()) on visitor-facing text drops placeholder literals like "<UNKNOWN>"
  if (type === "stats") {
    const list = items
      .map((it: Record<string, unknown>) => ({ value: fact(it.value, 20), label: fact(it.label, 40) }))
      .filter((it: { value: string; label: string }) => it.value && it.label)
      .slice(0, 4);
    return list.length ? { ...base, type, items: list } : null;
  }
  if (type === "industries" || type === "certifications") {
    const list = items
      .map((it: Record<string, unknown>) => ({ name: fact(it.name || it.label, 60) }))
      .filter((it: { name: string }) => it.name)
      .slice(0, 8);
    return list.length ? { ...base, type, title: fact(raw.title, 80) || undefined, items: list } : null;
  }
  if (type === "testimonials") {
    const list = items
      .map((it: Record<string, unknown>) => ({
        quote: fact(it.quote, 280),
        author: fact(it.author, 60),
        role: fact(it.role, 80) || undefined,
      }))
      .filter((it: { quote: string; author: string }) => it.quote && it.author)
      .slice(0, 6);
    return list.length ? { ...base, type, title: fact(raw.title, 80) || undefined, items: list } : null;
  }
  if (type === "cta_banner") {
    const heading = fact(raw.heading, 120);
    return heading
      ? { ...base, type, heading, subtext: fact(raw.subtext, 200) || undefined, button_label: fact(raw.button_label, 40) || undefined }
      : null;
  }
  return null;
}

/** Re-validate a (possibly owner-edited) sections array before persisting, keeping
 *  each block's enabled toggle and collapsing to one block per type. */
export function normalizeSectionsForStore(sections: unknown): Section[] {
  if (!Array.isArray(sections)) return [];
  const out: Section[] = [];
  const seen = new Set<string>();
  for (const raw of sections) {
    const s = normalizeSection(raw);
    if (!s || seen.has(s.type)) continue;
    seen.add(s.type);
    out.push({ ...s, enabled: (raw as { enabled?: boolean })?.enabled !== false });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDraft(raw: any): SiteDraft {
  const category = KNOWN_CATEGORIES.includes(raw?.category) ? raw.category : "other";
  const language = raw?.language === "hinglish" ? "hinglish" : "english";
  const products: ProductDraft[] = (Array.isArray(raw?.products) ? raw.products : [])
    .map((p: Record<string, unknown>) => ({
      title: fact(p.title, 80),
      description: fact(p.description, 300),
      category: fact(p.category, 40),
      price_text: fact(p.price_text, 40),
    }))
    .filter((p: ProductDraft) => p.title)
    .slice(0, MAX_IMPORT_PRODUCTS);
  const services = (Array.isArray(raw?.services) ? raw.services : [])
    .map((s: Record<string, unknown>) => ({ title: fact(s.title, 60), desc: fact(s.desc, 200) }))
    .filter((s: { title: string; desc: string }) => s.title)
    .slice(0, 3);
  const sections = (Array.isArray(raw?.sections) ? raw.sections : [])
    .map(normalizeSection)
    .filter((s: Section | null): s is Section => !!s);
  // dedupe sections by type (one of each), preserve order
  const seen = new Set<string>();
  const dedupedSections = sections.filter((s: Section) => (seen.has(s.type) ? false : (seen.add(s.type), true)));

  const tabs = (Array.isArray(raw?.tabs) ? raw.tabs : [])
    .filter((t: unknown) => BUILTIN_TAB_KEYS.includes(t as (typeof BUILTIN_TAB_KEYS)[number]));
  // always-on essentials
  for (const k of ["about", "contact"]) if (!tabs.includes(k)) tabs.push(k);
  if (products.length && !tabs.includes("products")) tabs.push("products");

  return {
    name: fact(raw?.name, 80) || "My Business",
    business_type: fact(raw?.business_type, 120),
    category,
    city: fact(raw?.city, 60),
    phone: fact(raw?.phone, 30).replace(/[^\d+ ]/g, ""),
    language,
    headline: fact(raw?.headline, 120),
    tagline: fact(raw?.tagline, 200),
    about: fact(raw?.about, 800),
    cta_label: fact(raw?.cta_label, 40) || "Get in touch",
    services,
    products,
    tabs,
    sections: dedupedSections,
  };
}

const TOOL: Anthropic.Tool = {
  name: "save_import",
  description: "Save the structured website draft extracted from the reference.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The business's real name" },
      business_type: { type: "string", description: "Readable descriptor, e.g. 'PET preform conveyor systems manufacturer' or 'bridal boutique'" },
      category: { type: "string", enum: [...KNOWN_CATEGORIES], description: "Closest fit for visual theme" },
      city: { type: "string" },
      phone: { type: "string", description: "Contact phone if stated, else empty" },
      language: { type: "string", enum: ["english", "hinglish"] },
      headline: { type: "string", description: "Hero headline, max 8 words, no business name, no clichés" },
      tagline: { type: "string", description: "One supporting line, max 16 words" },
      about: { type: "string", description: "About section, 2-3 warm sentences, first person plural" },
      cta_label: { type: "string", description: "Button label, 2-4 words" },
      services: {
        type: "array",
        description: "Exactly 3 core service/capability areas",
        items: {
          type: "object",
          properties: { title: { type: "string" }, desc: { type: "string" } },
          required: ["title", "desc"],
        },
      },
      products: {
        type: "array",
        description: "The business's REAL product or service lines named on the site (up to 8). Each is a distinct offering, not a marketing phrase.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Product/service name, 2-5 words" },
            description: { type: "string", description: "1-2 factual sentences about this offering" },
            category: { type: "string", description: "Short grouping, Title Case, e.g. 'Conveyors', 'Sarees'" },
            price_text: { type: "string", description: "Only if a price is stated on the site, else empty" },
          },
          required: ["title", "description", "category"],
        },
      },
      tabs: {
        type: "array",
        description: "Builtin page tabs to enable",
        items: { type: "string", enum: [...BUILTIN_TAB_KEYS] },
      },
      sections: {
        type: "array",
        description: "Rich blocks that fit this business. Include stats/certifications/testimonials ONLY if grounded in the reference (never invent client quotes or fake numbers). An 'industries' block (who they serve) and a 'cta_banner' are almost always appropriate.",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: [...SECTION_TYPES] },
            title: { type: "string" },
            heading: { type: "string", description: "cta_banner only" },
            subtext: { type: "string", description: "cta_banner only" },
            button_label: { type: "string", description: "cta_banner only" },
            items: {
              type: "array",
              description: "stats: {value,label}; industries/certifications: {name}; testimonials: {quote,author,role}",
              items: {
                type: "object",
                properties: {
                  value: { type: "string" }, label: { type: "string" },
                  name: { type: "string" },
                  quote: { type: "string" }, author: { type: "string" }, role: { type: "string" },
                },
              },
            },
          },
          required: ["type"],
        },
      },
    },
    required: ["name", "business_type", "category", "headline", "tagline", "about", "cta_label", "services", "products"],
  },
};

/**
 * Extract a complete, grounded website draft from reference text (the owner's old
 * site, reconstructed via fetch or web-research). Tool-forced JSON. No DB writes,
 * no image spend — this feeds the review screen the owner approves before we build.
 */
export async function extractSiteDraft(referenceText: string, url: string): Promise<SiteDraft> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "save_import" },
    messages: [{
      role: "user",
      content: `You are rebuilding a premium website for an existing Indian business, from a reference document describing their current site. The new site's job is to look more serious and modern than the old one, with their REAL products/services on it. Customers enquire via WhatsApp/phone — there is no online checkout.

Source URL: ${url}
Reference document (their existing site / web research about them):
"""
${referenceText.slice(0, 8000)}
"""

Extract a faithful, upgraded draft. Rules:
- Use their REAL facts — do not invent products, clients, certifications, or numbers. If the reference states a stat (e.g. "20 years", "500 installations"), you may include it; otherwise leave stats out.
- Products = the actual product/service lines named in the reference (up to 8). Group similar items.
- Premium, warm copy. No clichés ("one stop shop", "best in class"). No emoji. Mirror their language (English or Hinglish).
- Propose sections that genuinely fit; an industries block and a CTA banner are usually good. The owner will review everything before it goes live.`,
    }],
  });
  const tool = res.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("Could not read enough from that site to build a draft.");
  return normalizeDraft(tool.input);
}
