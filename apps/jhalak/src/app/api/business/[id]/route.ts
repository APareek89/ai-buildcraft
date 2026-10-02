import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { canManageBusiness } from "@/lib/auth";
import { provider } from "@/lib/mediaai";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
    if (!(await canManageBusiness(id))) {
      return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
    }
  try {
    const biz = await q(`select * from jhalak.businesses where id=$1`, [id]);
    if (!biz.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    const [content, products, reels, quota, leadsCount] = await Promise.all([
      q(`select content from jhalak.site_content where business_id=$1`, [id]),
      q(`select * from jhalak.products where business_id=$1 order by sort, created_at`, [id]),
      q(`select * from jhalak.reels where business_id=$1 order by created_at desc`, [id]),
      q(`select * from jhalak.quotas where business_id=$1`, [id]),
      q<{ n: string }>(`select count(*)::text as n from jhalak.leads where business_id=$1`, [id]),
    ]);
    return NextResponse.json({
      business: biz[0],
      content: content[0]?.content || null,
      products,
      reels,
      quota: quota[0] || { reel_packs_used: 0, photos_used: 0 },
      leads_count: Number(leadsCount[0]?.n || 0),
      media_provider: provider(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

const PATCHABLE = ["name", "category", "city", "phone", "whatsapp", "language", "template", "status"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
    if (!(await canManageBusiness(id))) {
      return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
    }
  try {
    const body = await req.json();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const k of PATCHABLE) {
      if (body[k] !== undefined) {
        vals.push(body[k]);
        sets.push(`${k}=$${vals.length}`);
      }
    }
    if (sets.length) {
      vals.push(id);
      await q(`update jhalak.businesses set ${sets.join(", ")} where id=$${vals.length}`, vals);
    }
    if (body.content !== undefined) {
      await q(
        `insert into jhalak.site_content (business_id, content) values ($1,$2)
         on conflict (business_id) do update set content=$2, updated_at=now()`,
        [id, JSON.stringify(body.content)]
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
