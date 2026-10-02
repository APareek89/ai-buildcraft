import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { slug, name, phone, message } = await req.json();
    if (!slug || !phone?.trim()) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }
    const biz = await q<{ id: string }>(`select id from jhalak.businesses where slug=$1`, [slug]);
    if (!biz.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    await q(
      `insert into jhalak.leads (business_id, name, phone, message) values ($1,$2,$3,$4)`,
      [biz[0].id, (name || "").trim(), phone.trim(), (message || "").trim()]
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
