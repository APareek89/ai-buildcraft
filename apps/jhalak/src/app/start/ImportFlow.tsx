"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, ArrowRight, ArrowLeft, Sparkles, Check, Trash2, Loader2 } from "lucide-react";
import { fetchJson } from "@/lib/client";
import type { SiteDraft } from "@/lib/import";
import type { Section } from "@/lib/tenant";

type Phase = "url" | "reading" | "review" | "building" | "error";

const READING_LINES = [
  "Reading your website…",
  "Understanding your business…",
  "Finding your products & services…",
  "Writing your new, upgraded copy…",
  "Choosing sections that fit…",
];

export default function ImportFlow({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("url");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<SiteDraft | null>(null);
  const [refText, setRefText] = useState("");
  const [refSource, setRefSource] = useState("");
  const [readingLine, setReadingLine] = useState(0);
  const [buildMsg, setBuildMsg] = useState("Creating your website…");

  // rotate the reading status lines
  useEffect(() => {
    if (phase !== "reading") return;
    const t = setInterval(() => setReadingLine((i) => (i + 1) % READING_LINES.length), 3500);
    return () => clearInterval(t);
  }, [phase]);

  const startImport = async () => {
    if (!/^https?:\/\//i.test(url.trim())) {
      // be forgiving: prepend https:// if they typed a bare domain
      if (/^[\w.-]+\.\w{2,}/.test(url.trim())) setUrl("https://" + url.trim());
      else return setError("Please paste a full website link, e.g. https://your-site.com");
    }
    const finalUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : "https://" + url.trim();
    setError("");
    setPhase("reading");
    const r = await fetchJson<{ draft: SiteDraft; source: string; reference_text: string }>("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: finalUrl }),
    });
    if (r.status === 401) { router.push("/signup?next=/start"); return; }
    if (!r.ok || !r.data) { setError(r.error || "We couldn't read that site."); setPhase("error"); return; }
    setDraft(r.data.draft);
    setRefText(r.data.reference_text || "");
    setRefSource(finalUrl);
    setPhase("review");
  };

  // ---- draft editing helpers ----
  const patch = (k: keyof SiteDraft, v: unknown) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const patchProduct = (i: number, k: string, v: unknown) =>
    setDraft((d) => (d ? { ...d, products: d.products.map((p, j) => (j === i ? { ...p, [k]: v } : p)) } : d));
  const removeProduct = (i: number) =>
    setDraft((d) => (d ? { ...d, products: d.products.filter((_, j) => j !== i) } : d));
  const toggleSection = (i: number) =>
    setDraft((d) => (d ? { ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, enabled: !s.enabled } : s)) } : d));
  const patchSection = (i: number, k: string, v: unknown) =>
    setDraft((d) => (d ? { ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, [k]: v } as Section : s)) } : d));

  const build = async () => {
    if (!draft) return;
    setPhase("building");
    setBuildMsg("Creating your website…");
    const r = await fetchJson<{ id: string; slug: string; products: number }>("/api/import/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, reference_text: refText, reference_source: refSource }),
    });
    if (r.status === 401) { router.push("/signup?next=/start"); return; }
    if (!r.ok || !r.data) { setError(r.error || "Couldn't build the site."); setPhase("error"); return; }
    await pollUntilReady(r.data.id, r.data.slug);
  };

  // poll the new business until hero + product images have landed, then open Studio
  const pollUntilReady = async (id: string, slug: string) => {
    for (let i = 0; i < 30; i++) {
      const r = await fetchJson<{ content: { hero_image_url?: string } | null; products: { status: string }[] }>(
        `/api/business/${id}`
      );
      if (r.ok && r.data) {
        const prods = r.data.products || [];
        const ready = prods.filter((p) => p.status === "ready").length;
        const hero = !!r.data.content?.hero_image_url;
        setBuildMsg(
          `${hero ? "Hero image ready · " : "Generating hero image · "}${
            prods.length ? `product photos ${ready}/${prods.length}` : "setting up your pages"
          }…`
        );
        const pending = prods.some((p) => p.status === "generating" || p.status === "processing");
        // hero is generated BEFORE products, so once no product is pending the hero has
        // already resolved (arrived or failed → gradient fallback). Don't wait forever
        // for a hero that will never come (provider off / gen failure).
        const done = prods.length ? !pending : hero || i >= 3;
        if (done) break;
      }
      await new Promise((res) => setTimeout(res, 4000));
    }
    router.push(`/studio/${id}`);
  };

  // ---------------- render ----------------

  if (phase === "reading" || phase === "building") {
    const msg = phase === "reading" ? READING_LINES[readingLine] : buildMsg;
    return (
      <div className="card p-10 max-w-xl mx-auto text-center">
        <Loader2 className="mx-auto mb-5 animate-spin text-blue-600" size={36} />
        <h2 className="text-lg font-semibold mb-2">
          {phase === "reading" ? "Building your website from your old one" : "Bringing your site to life"}
        </h2>
        <p className="text-slate-500 text-sm min-h-5">{msg}</p>
        <p className="text-xs text-slate-400 mt-6">
          {phase === "reading"
            ? "This usually takes 30–60 seconds — we only read your site, nothing is published yet."
            : "Generating real images — this runs in the background, you'll land in the editor shortly."}
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="card p-8 max-w-xl mx-auto text-center space-y-4">
        <p className="text-red-600 text-sm">{error}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { setError(""); setPhase("url"); }} className="btn-secondary">Try another link</button>
          <button onClick={onBack} className="btn-primary">Start fresh instead</button>
        </div>
      </div>
    );
  }

  if (phase === "review" && draft) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="rounded-xl bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 text-sm flex items-start gap-2">
          <Sparkles size={16} className="mt-0.5 shrink-0" />
          <span>Here’s the draft we built from your site — <b>check it, fix anything, remove what’s wrong</b>, then build. Nothing is published or generated until you press the button.</span>
        </div>

        {/* Business info */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Business</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><label className="field-label !mb-1">Name</label>
              <input value={draft.name} onChange={(e) => patch("name", e.target.value)} className="inp !py-1.5 !text-sm" /></div>
            <div><label className="field-label !mb-1">City</label>
              <input value={draft.city} onChange={(e) => patch("city", e.target.value)} placeholder="—" className="inp !py-1.5 !text-sm" /></div>
            <div><label className="field-label !mb-1">WhatsApp / phone</label>
              <input value={draft.phone} onChange={(e) => patch("phone", e.target.value)} placeholder="10-digit number" className="inp !py-1.5 !text-sm" /></div>
          </div>
        </div>

        {/* Copy */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Homepage copy</h3>
          <div><label className="field-label !mb-1">Headline</label>
            <input value={draft.headline} onChange={(e) => patch("headline", e.target.value)} className="inp text-lg font-semibold" /></div>
          <div><label className="field-label !mb-1">Tagline</label>
            <input value={draft.tagline} onChange={(e) => patch("tagline", e.target.value)} className="inp !py-1.5 !text-sm" /></div>
          <div><label className="field-label !mb-1">About</label>
            <textarea value={draft.about} onChange={(e) => patch("about", e.target.value)} rows={3} className="inp !py-1.5 !text-sm" /></div>
        </div>

        {/* Products */}
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">
            Products / services <span className="text-slate-400 normal-case font-normal">— AI will generate a photo for each</span>
          </h3>
          {!draft.products.length && <p className="text-sm text-slate-400">No products found — you can add them later in the catalogue.</p>}
          {draft.products.map((p, i) => (
            <div key={i} className="flex gap-2 items-start border-t border-slate-100 pt-3 first:border-0 first:pt-0">
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input value={p.title} onChange={(e) => patchProduct(i, "title", e.target.value)} placeholder="Name"
                  className="inp !py-1.5 !text-sm col-span-2" />
                <input value={p.category} onChange={(e) => patchProduct(i, "category", e.target.value)} placeholder="Category"
                  className="inp !py-1.5 !text-sm" />
                <input value={p.price_text} onChange={(e) => patchProduct(i, "price_text", e.target.value)} placeholder="Price (optional)"
                  className="inp !py-1.5 !text-sm" />
              </div>
              <button onClick={() => removeProduct(i)} aria-label="Remove"
                className="text-slate-300 hover:text-red-500 transition p-1.5 mt-0.5"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        {/* Sections */}
        {!!draft.sections.length && (
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Extra sections</h3>
            {draft.sections.map((s, i) => (
              <div key={i} className={`rounded-xl border px-4 py-3 ${s.enabled ? "border-blue-200 bg-blue-50/40" : "border-slate-200 opacity-60"}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleSection(i)}
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition ${s.enabled ? "bg-blue-600 text-white" : "border-2 border-slate-300"}`}>
                    {s.enabled && <Check size={13} />}
                  </button>
                  <span className="text-sm font-medium capitalize">{s.type.replace("_", " ")}</span>
                  <span className="text-xs text-slate-400 truncate">{sectionSummary(s)}</span>
                </div>
                {s.type === "cta_banner" && s.enabled && (
                  <input value={s.heading} onChange={(e) => patchSection(i, "heading", e.target.value)}
                    className="inp !py-1.5 !text-sm mt-2" />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onBack} className="btn-secondary"><ArrowLeft size={15} /> Back</button>
          <button onClick={build} className="btn-primary">
            <Sparkles size={15} /> Build my website
          </button>
        </div>
      </div>
    );
  }

  // phase === "url"
  return (
    <div className="max-w-xl mx-auto">
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 text-blue-600"><Globe size={18} /><h2 className="font-semibold">Paste your current website</h2></div>
        <p className="text-sm text-slate-500">
          We’ll read it, keep your real products and facts, and rebuild it as a premium site — with fresh copy and generated images. You review everything before it goes live.
        </p>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startImport()}
          placeholder="yourbusiness.com"
          className="inp"
          autoFocus
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onBack} className="btn-secondary"><ArrowLeft size={15} /> Back</button>
          <button onClick={startImport} className="btn-primary">Import my site <ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function sectionSummary(s: Section): string {
  if (s.type === "cta_banner") return "";
  if (s.type === "stats") return s.items.map((i) => `${i.value} ${i.label}`).join(" · ");
  if (s.type === "testimonials") return `${s.items.length} quote(s)`;
  return s.items.map((i) => i.name).join(", ");
}
