import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { q } from "@/lib/db";
import { canManageBusiness } from "@/lib/auth";
import { ACCENTS, BUILTIN_TABS, tabsConfig, SECTION_TYPES, type Content } from "@/lib/tenant";
import { generateImage } from "@/lib/mediaai";
import { heroImagePrompt, productImagePrompt } from "@/lib/imagery";
import { reserveGeneration, releaseGeneration } from "@/lib/quota";
import { normalizeSectionsForStore } from "@/lib/import";

const MODEL = "claude-sonnet-4-6";
const MAX_ROUNDS = 6;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolInput = any;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "update_site_copy",
    description: "Update website text. Only pass the fields you want to change.",
    input_schema: {
      type: "object",
      properties: {
        headline: { type: "string" },
        tagline: { type: "string" },
        about: { type: "string" },
        cta_label: { type: "string" },
        services: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, desc: { type: "string" } },
            required: ["title", "desc"],
          },
        },
      },
    },
  },
  {
    name: "set_template",
    description: "Switch the visual template.",
    input_schema: {
      type: "object",
      properties: { template: { type: "string", enum: ["elegant", "bold", "professional", "minimal"] } },
      required: ["template"],
    },
  },
  {
    name: "set_accent",
    description: "Change the site's accent color.",
    input_schema: {
      type: "object",
      properties: { accent: { type: "string", enum: Object.keys(ACCENTS) } },
      required: ["accent"],
    },
  },
  {
    name: "set_tabs",
    description: "Turn built-in nav tabs/pages on or off (also use this to ADD a built-in tab like Pricing/FAQ/Terms/Gallery — just enable it). Only pass the ones to change.",
    input_schema: {
      type: "object",
      properties: {
        products: { type: "boolean" }, about: { type: "boolean" },
        gallery: { type: "boolean" }, contact: { type: "boolean" },
        pricing: { type: "boolean" }, terms: { type: "boolean" }, faq: { type: "boolean" },
      },
    },
  },
  {
    name: "add_tab",
    description: "Add a NEW custom nav tab/page with your own name (e.g. 'Workshops', 'Careers'). For built-in pages (Pricing/FAQ/Terms/Gallery) use set_tabs instead.",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Tab name shown in the nav" },
        content: { type: "string", description: "Optional page text for the new tab" },
      },
      required: ["label"],
    },
  },
  {
    name: "rename_tab",
    description: "Rename a nav tab. tab_key is the tab's key (products/about/gallery/contact/pricing/terms/faq or a custom key).",
    input_schema: {
      type: "object",
      properties: { tab_key: { type: "string" }, label: { type: "string" } },
      required: ["tab_key", "label"],
    },
  },
  {
    name: "update_business",
    description: "Update business info shown on the site. Only pass fields to change.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" }, city: { type: "string" },
        phone: { type: "string" }, whatsapp: { type: "string" },
      },
    },
  },
  {
    name: "update_product",
    description: "Update one catalogue product. Only pass fields to change.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        title: { type: "string" }, description: { type: "string" },
        category: { type: "string" }, price_text: { type: "string" },
        discount_pct: { type: "integer", minimum: 0, maximum: 90 },
        visible: { type: "boolean" },
      },
      required: ["product_id"],
    },
  },
  {
    name: "update_section",
    description: "ADD or update a rich content block (stats/industries/testimonials/certifications/cta_banner) by its type/id. If a block of that type doesn't exist yet it is CREATED (use this to 'add a testimonials section'). Only pass fields to change; pass 'items' to set that block's entries.",
    input_schema: {
      type: "object",
      properties: {
        section_id: { type: "string", description: "Block id: stats | industries | testimonials | certifications | cta_banner" },
        title: { type: "string", description: "Section heading (industries/testimonials/certifications)" },
        heading: { type: "string", description: "cta_banner big heading" },
        subtext: { type: "string", description: "cta_banner subtext" },
        button_label: { type: "string", description: "cta_banner button label" },
        items: {
          type: "array",
          description: "Replace items. stats:{value,label}; industries/certifications:{name}; testimonials:{quote,author,role}",
          items: {
            type: "object",
            properties: {
              value: { type: "string" }, label: { type: "string" }, name: { type: "string" },
              quote: { type: "string" }, author: { type: "string" }, role: { type: "string" },
            },
          },
        },
      },
      required: ["section_id"],
    },
  },
  {
    name: "toggle_section",
    description: "Show or hide a rich content block by id (e.g. hide testimonials).",
    input_schema: {
      type: "object",
      properties: { section_id: { type: "string" }, enabled: { type: "boolean" } },
      required: ["section_id", "enabled"],
    },
  },
  {
    name: "regenerate_image",
    description: "Generate/replace an AI image. target='hero' for the hero image, or a product's exact title for its catalogue photo (or pass product_id). Put the owner's art direction in 'instruction' (e.g. 'more industrial, blue tones'). Use this whenever the owner asks to change/generate an image on the site.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "'hero' or a product title" },
        product_id: { type: "string", description: "product id (if regenerating a specific product photo)" },
        instruction: { type: "string", description: "art direction to apply" },
      },
    },
  },
  {
    name: "publish_site",
    description: "Publish the website (make it live). Use ONLY when the user explicitly asks to publish / go live.",
    input_schema: { type: "object", properties: {} },
  },
];

async function getState(bizId: string) {
  const [biz, content, products] = await Promise.all([
    q(`select id, slug, name, category, city, phone, whatsapp, language, template, status from jhalak.businesses where id=$1`, [bizId]),
    q<{ content: Record<string, unknown> }>(`select content from jhalak.site_content where business_id=$1`, [bizId]),
    q(`select id, title, category, price_text, discount_pct, visible, status from jhalak.products where business_id=$1 order by created_at`, [bizId]),
  ]);
  const c = { ...(content[0]?.content || {}) };
  delete c.reference_text; // keep the prompt lean
  return { business: biz[0], site_content: c, products };
}

async function loadContent(bizId: string): Promise<Content> {
  const rows = await q<{ content: Content }>(`select content from jhalak.site_content where business_id=$1`, [bizId]);
  return rows[0]?.content || {};
}
async function writeTabsConfig(bizId: string, list: unknown): Promise<void> {
  await q(
    `insert into jhalak.site_content (business_id, content) values ($1, jsonb_build_object('tabs_config', $2::jsonb))
     on conflict (business_id) do update set content = jhalak.site_content.content || jsonb_build_object('tabs_config', $2::jsonb), updated_at=now()`,
    [bizId, JSON.stringify(list)]
  );
}

async function runTool(bizId: string, name: string, input: ToolInput): Promise<string> {
  if (name === "update_site_copy") {
    const fields: Record<string, unknown> = {};
    for (const k of ["headline", "tagline", "about", "cta_label", "services"]) {
      if (input[k] !== undefined) fields[k] = input[k];
    }
    if (!Object.keys(fields).length) return "nothing to change";
    await q(
      `insert into jhalak.site_content (business_id, content) values ($1,$2)
       on conflict (business_id) do update set content = jhalak.site_content.content || $2::jsonb, updated_at=now()`,
      [bizId, JSON.stringify(fields)]
    );
    return `updated: ${Object.keys(fields).join(", ")}`;
  }
  if (name === "set_template") {
    await q(`update jhalak.businesses set template=$1 where id=$2`, [input.template, bizId]);
    return `template → ${input.template}`;
  }
  if (name === "set_accent") {
    await q(
      `insert into jhalak.site_content (business_id, content) values ($1, jsonb_build_object('accent', $2::text))
       on conflict (business_id) do update set content = jhalak.site_content.content || jsonb_build_object('accent', $2::text), updated_at=now()`,
      [bizId, input.accent]
    );
    return `accent → ${input.accent}`;
  }
  if (name === "set_tabs") {
    const changes: Record<string, boolean> = {};
    for (const k of ["products", "about", "gallery", "contact", "pricing", "terms", "faq"]) {
      if (typeof input[k] === "boolean") changes[k] = input[k];
    }
    if (!Object.keys(changes).length) return "nothing to change";
    // write the full resolved tabs_config so this works even when a site already has one
    const list = tabsConfig(await loadContent(bizId)).map((t) =>
      Object.prototype.hasOwnProperty.call(changes, t.key) ? { ...t, enabled: changes[t.key] } : t
    );
    await writeTabsConfig(bizId, list);
    return `tabs updated: ${Object.entries(changes).map(([k, v]) => `${k} ${v ? "on" : "off"}`).join(", ")}`;
  }
  if (name === "add_tab") {
    const label = String(input.label || "").trim().slice(0, 40);
    if (!label) return "please give the new tab a name";
    const key = "custom-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
    const content = await loadContent(bizId);
    const list = tabsConfig(content);
    if (list.some((t) => t.key === key)) return `a "${label}" tab already exists`;
    list.push({ key, label, enabled: true, builtin: false, text: true });
    await writeTabsConfig(bizId, list);
    if (typeof input.content === "string" && input.content.trim()) {
      await q(
        `update jhalak.site_content set content = jsonb_set(content, '{pages}',
           coalesce(content->'pages','{}'::jsonb) || jsonb_build_object($2::text, $3::text)), updated_at=now()
         where business_id=$1`,
        [bizId, key, input.content.trim().slice(0, 4000)]
      );
    }
    return `added the "${label}" tab`;
  }
  if (name === "rename_tab") {
    const key = String(input.tab_key || "").trim();
    const label = String(input.label || "").trim().slice(0, 40);
    if (!key || !label) return "need a tab and a new name";
    const list = tabsConfig(await loadContent(bizId));
    const idx = list.findIndex((t) => t.key === key);
    if (idx < 0) return `no tab '${key}' on this site`;
    list[idx] = { ...list[idx], label };
    await writeTabsConfig(bizId, list);
    return `renamed that tab to "${label}"`;
  }
  if (name === "update_business") {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const k of ["name", "city", "phone", "whatsapp"]) {
      if (input[k] !== undefined) { vals.push(input[k]); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return "nothing to change";
    vals.push(bizId);
    await q(`update jhalak.businesses set ${sets.join(", ")} where id=$${vals.length}`, vals);
    return `business updated: ${sets.length} field(s)`;
  }
  if (name === "update_product") {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const k of ["title", "description", "category", "price_text", "discount_pct", "visible"]) {
      if (input[k] !== undefined) { vals.push(input[k]); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return "nothing to change";
    vals.push(input.product_id, bizId);
    await q(
      `update jhalak.products set ${sets.join(", ")} where id=$${vals.length - 1} and business_id=$${vals.length}`,
      vals
    );
    return `product ${String(input.product_id).slice(0, 8)} updated`;
  }
  if (name === "update_section") {
    const rows = await q<{ sections: unknown }>(`select content->'sections' as sections from jhalak.site_content where business_id=$1`, [bizId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections: any[] = Array.isArray(rows[0]?.sections) ? (rows[0].sections as any[]) : [];
    const idx = sections.findIndex((s) => s?.id === input.section_id || s?.type === input.section_id);
    let verb = "updated";
    if (idx < 0) {
      // create the block if it doesn't exist yet ("add a testimonials section")
      if (!SECTION_TYPES.includes(input.section_id)) return `unknown section type '${input.section_id}'`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ns: any = { id: input.section_id, type: input.section_id, enabled: true };
      for (const k of ["title", "heading", "subtext", "button_label"]) if (input[k] !== undefined) ns[k] = input[k];
      if (Array.isArray(input.items)) ns.items = input.items;
      sections.push(ns);
      verb = "added";
    } else {
      const s = { ...sections[idx] };
      for (const k of ["title", "heading", "subtext", "button_label"]) if (input[k] !== undefined) s[k] = input[k];
      if (Array.isArray(input.items)) s.items = input.items;
      s.enabled = true; // editing a block implies showing it
      sections[idx] = s;
    }
    const clean = normalizeSectionsForStore(sections);
    if (!clean.some((s) => s.type === input.section_id)) {
      return `couldn't ${verb} the ${input.section_id} section — it needs some content (e.g. the stats or quotes to show).`;
    }
    await q(`update jhalak.site_content set content = jsonb_set(coalesce(content,'{}'::jsonb), '{sections}', $2::jsonb), updated_at=now() where business_id=$1`, [bizId, JSON.stringify(clean)]);
    return `${verb} the ${input.section_id} section`;
  }
  if (name === "toggle_section") {
    const rows = await q<{ sections: unknown }>(`select content->'sections' as sections from jhalak.site_content where business_id=$1`, [bizId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections: any[] = Array.isArray(rows[0]?.sections) ? (rows[0].sections as any[]) : [];
    const idx = sections.findIndex((s) => s?.id === input.section_id || s?.type === input.section_id);
    if (idx < 0) return `no section '${input.section_id}' on this site`;
    sections[idx] = { ...sections[idx], enabled: !!input.enabled };
    await q(`update jhalak.site_content set content = jsonb_set(content, '{sections}', $2::jsonb), updated_at=now() where business_id=$1`, [bizId, JSON.stringify(sections)]);
    return `${input.enabled ? "showing" : "hiding"} the ${input.section_id} section`;
  }
  if (name === "regenerate_image") {
    const productId = input.product_id ? String(input.product_id) : "";
    const target = String(input.target || (productId ? "" : "hero"));
    const instruction = String(input.instruction || "").slice(0, 300);
    if (!(await reserveGeneration(bizId))) return "You've reached the image-generation limit for this site.";
    const bizRows = await q<{ name: string; category: string; city: string }>(
      `select name, category, city from jhalak.businesses where id=$1`, [bizId]
    );
    const b = bizRows[0];
    const dir = instruction ? ` Art direction: ${instruction}.` : "";
    if (!productId && target.toLowerCase() === "hero") {
      const cRows = await q<{ content: { headline?: string; tagline?: string; about?: string; business_type?: string } }>(
        `select content from jhalak.site_content where business_id=$1`, [bizId]
      );
      const content = cRows[0]?.content || {};
      const url = await generateImage(heroImagePrompt(b, content, content.business_type) + dir, "hero");
      if (!url) { await releaseGeneration(bizId); return "image generation failed — please try again in a moment"; }
      await q(
        `insert into jhalak.site_content (business_id, content) values ($1, jsonb_build_object('hero_image_url', $2::text))
         on conflict (business_id) do update set content = jhalak.site_content.content || jsonb_build_object('hero_image_url', $2::text), updated_at=now()`,
        [bizId, url]
      );
      return "regenerated the hero image 🎨";
    }
    const prod = productId
      ? await q<{ id: string; title: string; description: string; category: string }>(
          `select id, title, description, category from jhalak.products where id=$1 and business_id=$2 limit 1`,
          [productId, bizId]
        )
      : await q<{ id: string; title: string; description: string; category: string }>(
          `select id, title, description, category from jhalak.products where business_id=$1 and lower(title)=lower($2) limit 1`,
          [bizId, target]
        );
    if (!prod.length) { await releaseGeneration(bizId); return `couldn't find that product — try its exact title`; }
    const p = prod[0];
    const url = await generateImage(productImagePrompt({ title: p.title, description: p.description, category: p.category }, b) + dir, "square");
    if (!url) { await releaseGeneration(bizId); return "image generation failed — please try again in a moment"; }
    await q(`update jhalak.products set processed_url=$1, status='ready' where id=$2`, [url, p.id]);
    return `regenerated the image for ${p.title} 🎨`;
  }
  if (name === "publish_site") {
    await q(`update jhalak.businesses set status='published' where id=$1`, [bizId]);
    return "site published 🎉";
  }
  return "unknown tool";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!(await canManageBusiness(id))) {
      return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
    }
    const { messages, scope } = (await req.json()) as {
      messages: { role: "user" | "assistant"; content: string }[];
      scope?: { sel?: string; label?: string };
    };
    if (!messages?.length) return NextResponse.json({ error: "no messages" }, { status: 400 });

    const state = await getState(id);
    if (!state.business) return NextResponse.json({ error: "not found" }, { status: 404 });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = `You are Jhalak's website editor, helping an Indian small business owner improve their website by chatting. You have tools that ACTUALLY change the live site — use them whenever the user asks for a change; never claim a change without calling a tool.

CURRENT SITE STATE:
${JSON.stringify(state, null, 1).slice(0, 6000)}

Rules:
- Keep copy premium and warm; match the owner's language (English or Hinglish — mirror how they write to you).
- Small, precise edits — only change what was asked.
- Accent colors available: ${Object.keys(ACCENTS).join(", ")}. Templates: elegant, bold, professional, minimal.
- IMAGES: when the owner asks to change/generate/replace an image, JUST DO IT with regenerate_image (hero, or a product by product_id/title) — never say you can't generate images. Only decline if the requested subject is clearly off-brand for their business, and even then offer 2-3 on-brand alternatives.
- You can add or edit stats / industries / testimonials / certifications / CTA-banner blocks (update_section — it CREATES the block if missing), add/enable/rename nav tabs (set_tabs, add_tab, rename_tab), and manage products.
- Publish ONLY when explicitly asked.
- After making changes, reply in 1-3 short sentences describing what changed. No markdown headers, no lists unless asked.
- If a request is genuinely impossible (custom fonts, embedded video), say so honestly and suggest the closest thing you CAN do.${
      scope?.sel
        ? `\n\nThe owner has SELECTED "${scope.label || scope.sel}" (id: ${scope.sel}) in the live preview — apply their request ONLY to that. Map the id to a tool:
  headline/tagline/about/cta → update_site_copy (cta means cta_label);
  service:N → update_site_copy.services (index N);
  hero-image → regenerate_image(target:'hero');
  product:<id> → that product — regenerate_image(product_id:'<id>') to change its photo, or update_product for its text/price;
  tab:<key> → set_tabs (to hide) or rename_tab;
  section:<id> → update_section / toggle_section.`
        : ""
    }`;

    const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
    const applied: string[] = [];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system,
        tools: TOOLS,
        messages: convo,
      });

      const toolUses = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
      const text = res.content.filter((c) => c.type === "text").map((c) => (c as Anthropic.TextBlock).text).join("\n");

      if (!toolUses.length) {
        return NextResponse.json({ reply: text || "Done.", applied });
      }

      convo.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let out: string;
        try {
          out = await runTool(id, tu.name, tu.input);
          applied.push(out);
        } catch (e) {
          out = `error: ${e instanceof Error ? e.message : "failed"}`;
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      convo.push({ role: "user", content: results });
    }

    return NextResponse.json({ reply: "Made the changes — take a look at the preview.", applied });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
