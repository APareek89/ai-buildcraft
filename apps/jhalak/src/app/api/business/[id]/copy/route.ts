import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { canManageBusiness } from "@/lib/auth";
import { generateSiteCopy } from "@/lib/claude";
import { generateAndSaveHero } from "@/lib/imagery";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
    if (!(await canManageBusiness(id))) {
      return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
    }
  try {
    const { offering, special, action } = await req.json();
    const biz = await q<{ name: string; category: string; city: string; language: string }>(
      `select name, category, city, language from jhalak.businesses where id=$1`,
      [id]
    );
    if (!biz.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    const existing = await q<{ content: { reference_text?: string; hero_image_url?: string } }>(
      `select content from jhalak.site_content where business_id=$1`, [id]
    );
    const referenceText = existing[0]?.content?.reference_text;
    const hasHero = !!existing[0]?.content?.hero_image_url;
    const copy = await generateSiteCopy(
      biz[0],
      {
        offering: offering || "",
        special: special || "",
        action: action || "contact us on WhatsApp",
      },
      referenceText
    );
    // merge: keep reference/tabs/accent keys, overwrite the copy fields
    await q(
      `insert into jhalak.site_content (business_id, content) values ($1,$2)
       on conflict (business_id) do update
       set content = jhalak.site_content.content || $2::jsonb, updated_at=now()`,
      [id, JSON.stringify(copy)]
    );
    // Fresh-build path: give owners with no hero a generated one, grounded in the
    // copy we just wrote. Fire-and-forget (budget-guarded) so the response is fast;
    // the Studio preview picks it up on reload. Skips if a hero already exists.
    if (!hasHero) {
      generateAndSaveHero(id, biz[0], copy).catch((e) =>
        console.error("[copy] hero gen failed:", e instanceof Error ? e.message : e)
      );
    }
    return NextResponse.json({ content: copy });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
