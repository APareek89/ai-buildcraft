import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { canManageBusiness } from "@/lib/auth";
import { readReferenceFromUrl } from "@/lib/reference";

const MAX_CHARS = 4000;
const MAX_DOC_BYTES = 10 * 1024 * 1024;

async function saveReference(bizId: string, text: string, source: string) {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (clean.length < 40) throw new Error("Could not find readable text in that reference.");
  await q(
    `insert into jhalak.site_content (business_id, content)
     values ($1, jsonb_build_object('reference_text', $2::text, 'reference_source', $3::text))
     on conflict (business_id) do update
     set content = jhalak.site_content.content || jsonb_build_object('reference_text', $2::text, 'reference_source', $3::text),
         updated_at = now()`,
    [bizId, clean, source]
  );
  return clean.length;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!(await canManageBusiness(id))) {
      return NextResponse.json({ error: "Please log in as the owner of this business.", auth: true }, { status: 403 });
    }
    const biz = await q(`select 1 from jhalak.businesses where id=$1`, [id]);
    if (!biz.length) return NextResponse.json({ error: "not found" }, { status: 404 });

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const { url } = await req.json();
      if (!/^https?:\/\//i.test(url || "")) {
        return NextResponse.json({ error: "Please enter a full link starting with http(s)://" }, { status: 400 });
      }
      const { text, source: via } = await readReferenceFromUrl(url);
      const chars = await saveReference(id, text, url);
      return NextResponse.json({ ok: true, chars, source: via });
    }

    // multipart: document upload (txt / md / pdf)
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (file.size > MAX_DOC_BYTES) {
      return NextResponse.json({ error: "Document too large (max 10MB)." }, { status: 413 });
    }
    const name = file.name.toLowerCase();
    let text = "";
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const parsed = await pdfParse(Buffer.from(await file.arrayBuffer()));
      text = parsed.text || "";
    } else if (name.endsWith(".txt") || name.endsWith(".md") || (file.type || "").startsWith("text/")) {
      text = await file.text();
    } else {
      return NextResponse.json(
        { error: "Please upload a PDF or text file (or paste your website link instead)." },
        { status: 400 }
      );
    }
    const chars = await saveReference(id, text, file.name);
    return NextResponse.json({ ok: true, chars, source: "document" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
