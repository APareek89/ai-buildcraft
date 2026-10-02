import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { canManageBusiness } from "@/lib/auth";
import { saveMedia, mediaUrl } from "@/lib/media";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!(await canManageBusiness(id))) {
      return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
    }
    const biz = await q(`select 1 from jhalak.businesses where id=$1`, [id]);
    if (!biz.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo too large (max 2MB)." }, { status: 413 });
    }
    if (!(file.type || "").startsWith("image/")) {
      return NextResponse.json({ error: "Please upload an image (PNG/JPG/SVG)." }, { status: 400 });
    }
    const mediaId = await saveMedia(Buffer.from(await file.arrayBuffer()), file.type || "image/png");
    const url = mediaUrl(mediaId);
    await q(`update jhalak.businesses set logo_url=$1 where id=$2`, [url, id]);
    return NextResponse.json({ ok: true, logo_url: url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!(await canManageBusiness(id))) {
      return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
    }
    await q(`update jhalak.businesses set logo_url='' where id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
