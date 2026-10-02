import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const em = (email || "").trim().toLowerCase();
    const rows = await q<{ id: string; password_hash: string }>(
      `select id, password_hash from jhalak.users where email=$1`, [em]
    );
    if (!rows.length || !verifyPassword(password || "", rows[0].password_hash)) {
      return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
    }
    await setSessionCookie(rows[0].id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
