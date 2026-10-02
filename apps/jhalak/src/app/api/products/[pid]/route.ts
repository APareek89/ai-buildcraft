import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { canManageBusiness } from "@/lib/auth";

async function guard(pid: string): Promise<boolean> {
  const rows = await q<{ business_id: string }>(`select business_id from jhalak.products where id=$1`, [pid]);
  if (!rows.length) return false;
  return canManageBusiness(rows[0].business_id);
}

const PATCHABLE = ["title", "description", "price_text", "visible", "category", "discount_pct"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;
  try {
    if (!(await guard(pid))) return NextResponse.json({ error: "Please log in as the owner.", auth: true }, { status: 403 });
    const body = await req.json();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const k of PATCHABLE) {
      if (body[k] !== undefined) {
        vals.push(body[k]);
        sets.push(`${k}=$${vals.length}`);
      }
    }
    if (!sets.length) return NextResponse.json({ ok: true });
    vals.push(pid);
    await q(`update jhalak.products set ${sets.join(", ")} where id=$${vals.length}`, vals);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ pid: string }> }) {
  try {
    const { pid } = await ctx.params;
    if (!(await guard(pid))) return NextResponse.json({ error: "Please log in as the owner.", auth: true }, { status: 403 });
    await q(`delete from jhalak.products where id=$1`, [pid]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
