import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { canManageBusiness } from "@/lib/auth";

/**
 * Inline-edit endpoint for the Studio ?edit=1 bridge. MERGES a single content field
 * (never a full-content replace, unlike the business PATCH). Supports the top-level
 * text fields and services[i].{title,desc}. Auth: owner only.
 */
const TEXT_FIELDS = new Set(["headline", "tagline", "about", "cta_label"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await canManageBusiness(id))) {
    return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
  }
  try {
    const { path, value } = await req.json();
    if (typeof path !== "string" || typeof value !== "string") {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    const v = value.replace(/\s+/g, " ").trim().slice(0, 2000);

    if (TEXT_FIELDS.has(path)) {
      await q(
        `insert into jhalak.site_content (business_id, content) values ($1, jsonb_build_object($2::text, $3::text))
         on conflict (business_id) do update
         set content = jhalak.site_content.content || jsonb_build_object($2::text, $3::text), updated_at = now()`,
        [id, path, v]
      );
      return NextResponse.json({ ok: true, path });
    }

    const m = path.match(/^service:(\d+):(title|desc)$/);
    if (m) {
      const idx = Number(m[1]);
      const key = m[2] as "title" | "desc";
      const rows = await q<{ services: { title: string; desc: string }[] | null }>(
        `select content->'services' as services from jhalak.site_content where business_id=$1`,
        [id]
      );
      const services = rows[0]?.services;
      if (!Array.isArray(services) || !services[idx]) {
        return NextResponse.json({ error: "no such service" }, { status: 400 });
      }
      services[idx][key] = v;
      await q(
        `update jhalak.site_content set content = jsonb_set(content, '{services}', $2::jsonb), updated_at=now() where business_id=$1`,
        [id, JSON.stringify(services)]
      );
      return NextResponse.json({ ok: true, path });
    }

    return NextResponse.json({ error: "This field can't be edited inline." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
