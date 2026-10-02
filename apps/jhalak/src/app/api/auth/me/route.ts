import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getSessionUser, clearSessionCookie } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ user: null });
    const businesses = await q(
      `select id, slug, name, status from jhalak.businesses where owner_id=$1 order by created_at desc`,
      [user.id]
    );
    return NextResponse.json({ user, businesses });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
