import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { canManageBusiness } from "@/lib/auth";
import { generateReelPack } from "@/lib/jobs";
import { provider } from "@/lib/mediaai";

const MAX_REEL_PACKS = 2; // hard cost cap per business in this preview

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
    if (!(await canManageBusiness(id))) {
      return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
    }
  try {
    if (provider() === "off") {
      return NextResponse.json(
        { error: "Reel studio is not connected to a video provider in this preview. Add GEMINI_API_KEY with Veo access to enable it." },
        { status: 503 }
      );
    }
    const { product_id, brief, kind } = await req.json();
    const biz = await q<{ name: string; category: string; city: string; language: string }>(
      `select name, category, city, language from jhalak.businesses where id=$1`, [id]
    );
    if (!biz.length) return NextResponse.json({ error: "not found" }, { status: 404 });

    const quota = await q<{ reel_packs_used: number }>(
      `select reel_packs_used from jhalak.quotas where business_id=$1`, [id]
    );
    if ((quota[0]?.reel_packs_used || 0) >= MAX_REEL_PACKS) {
      return NextResponse.json(
        { error: `Reel limit reached (${MAX_REEL_PACKS} packs per business in this preview).` },
        { status: 429 }
      );
    }

    const prod = await q<{ id: string; title: string; description: string; processed_url: string; original_url: string }>(
      `select id, title, description, processed_url, original_url from jhalak.products where id=$1 and business_id=$2`,
      [product_id, id]
    );
    if (!prod.length) return NextResponse.json({ error: "product not found" }, { status: 404 });
    const p = prod[0];
    const imageUrl = p.processed_url || p.original_url;
    const imageMediaId = imageUrl.split("/").pop() || "";
    if (!imageMediaId) {
      return NextResponse.json({ error: "product image not ready yet" }, { status: 400 });
    }

    await q(`update jhalak.quotas set reel_packs_used = reel_packs_used + 1 where business_id=$1`, [id]);
    generateReelPack(
      id,
      { id: p.id, title: p.title, description: p.description, image_media_id: imageMediaId },
      biz[0],
      typeof brief === "string" ? brief.slice(0, 600) : undefined,
      kind === "image" ? "image" : "video"
    );
    return NextResponse.json({ ok: true, note: "Reel pack generating — takes 1-4 minutes." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const reels = await q(`select * from jhalak.reels where business_id=$1 order by created_at desc`, [id]);
    return NextResponse.json({ reels });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
