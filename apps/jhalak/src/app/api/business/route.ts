import { NextRequest, NextResponse } from "next/server";
import { q, slugify } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign up or log in first.", auth: true }, { status: 401 });
    const b = await req.json();
    if (!b.name?.trim()) {
      return NextResponse.json({ error: "Business name is required" }, { status: 400 });
    }
    const base = slugify(b.name);
    let slug = base;
    for (let i = 0; i < 20; i++) {
      const exists = await q(`select 1 from jhalak.businesses where slug=$1`, [slug]);
      if (!exists.length) break;
      slug = `${base}-${Math.floor(Math.random() * 900 + 100)}`;
    }
    const rows = await q<{ id: string; slug: string }>(
      `insert into jhalak.businesses (slug, name, category, city, phone, whatsapp, language, template, owner_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, slug`,
      [
        slug,
        b.name.trim(),
        b.category || "boutique",
        b.city || "",
        b.phone || "",
        b.whatsapp || b.phone || "",
        b.language || "english",
        b.template || "elegant",
        user.id,
      ]
    );
    await q(`insert into jhalak.quotas (business_id) values ($1) on conflict do nothing`, [
      rows[0].id,
    ]);
    return NextResponse.json(rows[0]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
