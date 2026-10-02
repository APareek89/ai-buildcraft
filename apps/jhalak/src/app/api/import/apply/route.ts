import { NextRequest, NextResponse } from "next/server";
import { q, slugify, withTx } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { BUILTIN_TABS } from "@/lib/tenant";
import { generateSiteImagery } from "@/lib/jobs";
import { normalizeSectionsForStore } from "@/lib/import";
import type { SiteDraft } from "@/lib/import";

// visual theme seeded from the extracted category (owner can restyle in Studio)
const THEME_BY_CATEGORY: Record<string, { template: string; accent: string }> = {
  boutique: { template: "elegant", accent: "amber" },
  salon: { template: "bold", accent: "rose" },
  clinic: { template: "professional", accent: "blue" },
  gym: { template: "bold", accent: "violet" },
  restaurant: { template: "elegant", accent: "amber" },
  other: { template: "professional", accent: "blue" },
};

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign up or log in first.", auth: true }, { status: 401 });
    }
    const body = await req.json();
    const draft = body.draft as SiteDraft;
    if (!draft?.name?.trim()) return NextResponse.json({ error: "Nothing to build — draft is empty." }, { status: 400 });

    const category = draft.category || "other";
    const { template, accent } = THEME_BY_CATEGORY[category] || THEME_BY_CATEGORY.other;

    // tabs_config from the (owner-reviewed) enabled tab keys
    const enabled = new Set(Array.isArray(draft.tabs) ? draft.tabs : []);
    const tabsConfig = BUILTIN_TABS.map((b) => ({ ...b, enabled: enabled.has(b.key) }));

    const content = {
      headline: draft.headline || draft.name,
      tagline: draft.tagline || "",
      about: draft.about || "",
      cta_label: draft.cta_label || "Get in touch",
      services: Array.isArray(draft.services) ? draft.services : [],
      accent,
      business_type: draft.business_type || "",
      tabs_config: tabsConfig,
      sections: normalizeSectionsForStore(draft.sections),
      reference_text: typeof body.reference_text === "string" ? body.reference_text.slice(0, 4000) : "",
      reference_source: body.reference_source || body.url || "",
    };

    // Business + quotas + content + products are one atomic unit — a mid-sequence
    // failure must not orphan a business (and burn its unique slug) or strand products.
    const { bizId, slug, productPlan } = await withTx(async (query) => {
      const base = slugify(draft.name);
      let slug = base;
      for (let i = 0; i < 20; i++) {
        const ex = await query(`select 1 from jhalak.businesses where slug=$1`, [slug]);
        if (!ex.length) break;
        slug = `${base}-${Math.floor(Math.random() * 900 + 100)}`;
      }
      const rows = await query<{ id: string }>(
        `insert into jhalak.businesses (slug, name, category, city, phone, whatsapp, language, template, owner_id, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') returning id`,
        [slug, draft.name.trim(), category, draft.city || "", draft.phone || "", draft.phone || "", draft.language || "english", template, user.id]
      );
      const bizId = rows[0].id;
      await query(`insert into jhalak.quotas (business_id) values ($1) on conflict do nothing`, [bizId]);
      await query(
        `insert into jhalak.site_content (business_id, content) values ($1,$2)
         on conflict (business_id) do update set content=$2, updated_at=now()`,
        [bizId, JSON.stringify(content)]
      );
      const productPlan: { id: string; title: string; description: string; category: string }[] = [];
      for (const p of Array.isArray(draft.products) ? draft.products : []) {
        if (!p?.title?.trim()) continue;
        const r = await query<{ id: string }>(
          `insert into jhalak.products (business_id, title, description, category, price_text, status, visible, original_url)
           values ($1,$2,$3,$4,$5,'generating',true,'') returning id`,
          [bizId, p.title.trim(), p.description || "", p.category || "", p.price_text || ""]
        );
        productPlan.push({ id: r[0].id, title: p.title.trim(), description: p.description || "", category: p.category || "" });
      }
      return { bizId, slug, productPlan };
    });

    // sequential (OOM-safe), budget-capped imagery: hero + product photos — after COMMIT
    generateSiteImagery(
      bizId,
      { name: draft.name, category, city: draft.city || "", language: draft.language || "english" },
      draft.business_type || category,
      { headline: draft.headline, tagline: draft.tagline, about: draft.about },
      productPlan
    );

    return NextResponse.json({ id: bizId, slug, products: productPlan.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
