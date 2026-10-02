import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();
    const em = (email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    if ((password || "").length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    const exists = await q(`select 1 from jhalak.users where email=$1`, [em]);
    if (exists.length) return NextResponse.json({ error: "An account with this email already exists — try logging in." }, { status: 409 });
    const rows = await q<{ id: string }>(
      `insert into jhalak.users (email, name, password_hash) values ($1,$2,$3) returning id`,
      [em, (name || "").trim(), hashPassword(password)]
    );
    await setSessionCookie(rows[0].id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
