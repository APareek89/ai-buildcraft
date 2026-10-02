import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readReferenceFromUrl } from "@/lib/reference";
import { extractSiteDraft } from "@/lib/import";

// Web-research + extraction can take ~30s on a JS-rendered site.
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign up or log in first.", auth: true }, { status: 401 });
    }
    const { url } = await req.json();
    if (!/^https?:\/\//i.test(url || "")) {
      return NextResponse.json({ error: "Please enter a full link starting with http(s)://" }, { status: 400 });
    }
    const { text, source } = await readReferenceFromUrl(url);
    if (text.replace(/\s+/g, " ").trim().length < 40) {
      return NextResponse.json(
        { error: "We couldn't read enough from that site. Try another link, or start fresh instead." },
        { status: 422 }
      );
    }
    const draft = await extractSiteDraft(text, url);
    // reference_text is passed back so /apply can persist it for the Studio assistant,
    // without a second (paid) web-research pass.
    return NextResponse.json({ draft, source, reference_text: text.slice(0, 4000) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
