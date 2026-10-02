import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export async function GET() {
  try {
    await q(`select 1`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "db unreachable" },
      { status: 500 }
    );
  }
}
