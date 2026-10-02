import { NextRequest, NextResponse } from "next/server";
import { getMedia } from "@/lib/media";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ mid: string }> }) {
  try {
    const { mid } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/.test(mid)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }
    const m = await getMedia(mid);
    if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(m.bytes), {
      headers: {
        "Content-Type": m.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
