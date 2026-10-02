"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Package, Globe, Clapperboard, Inbox, Check, Pencil, Plus, X,
  Upload, Sparkles, Save, ImagePlus, Trash2, Eye, EyeOff, Lightbulb, Wand2,
  ExternalLink, Copy as CopyIcon, MessageCircle, ChevronDown, ChevronUp, Palette, Type,
} from "lucide-react";

const InstagramIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
);
const FacebookIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z"/></svg>
);
const TwitterIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-6.8 7.8L23 22h-6.3l-4.9-6.4L6.2 22H3l7.3-8.3L1 2h6.5l4.4 5.8L18.9 2zm-1.1 18h1.7L7.4 3.9H5.6L17.8 20z"/></svg>
);
import { fetchJson, downscaleImage } from "@/lib/client";
import AppShell, { type PortfolioSite } from "@/components/AppShell";

type Biz = {
  id: string; slug: string; name: string; category: string; city: string;
  phone: string; whatsapp: string; language: string; template: string; status: string;
  logo_url: string;
};
type Tab = { key: string; label: string; enabled: boolean; builtin: boolean; text: boolean };
type Content = {
  headline?: string; tagline?: string; about?: string;
  services?: { title: string; desc: string }[]; cta_label?: string;
  tabs_config?: Tab[]; pages?: Record<string, string>;
  accent?: string; font?: string;
  tabs?: Record<string, boolean>;
};
type Product = {
  id: string; title: string; description: string; price_text: string; tags: string[];
  category: string; discount_pct: number;
  processed_url: string; original_url: string; status: string; visible: boolean; error: string;
};
type Reel = { id: string; product_id: string; variant: string; video_url: string; status: string; error: string; kind: string };
type Lead = { id: string; name: string; phone: string; message: string; created_at: string };
type Idea = { title: string; hook: string; description: string; source: string };

const NAV = [
  { id: "Overview", icon: LayoutDashboard },
  { id: "Catalogue", icon: Package },
  { id: "Website", icon: Globe },
  { id: "Reels", icon: Clapperboard },
  { id: "Leads", icon: Inbox },
] as const;

const DEFAULT_TABS: Tab[] = [
  { key: "products", label: "Our Products", enabled: true, builtin: true, text: false },
  { key: "about", label: "About Us", enabled: true, builtin: true, text: false },
  { key: "gallery", label: "Gallery", enabled: false, builtin: true, text: false },
  { key: "contact", label: "Contact", enabled: true, builtin: true, text: false },
  { key: "pricing", label: "Pricing", enabled: false, builtin: true, text: true },
  { key: "terms", label: "Terms & Conditions", enabled: false, builtin: true, text: true },
  { key: "faq", label: "FAQ", enabled: false, builtin: true, text: true },
];

function resolveTabs(content: Content): Tab[] {
  const saved = content.tabs_config;
  if (saved?.length) {
    const byKey = new Map(saved.map((t) => [t.key, t]));
    const out = DEFAULT_TABS.map((d) => ({ ...d, ...(byKey.get(d.key) || {}) }));
    saved.forEach((s) => { if (!DEFAULT_TABS.some((d) => d.key === s.key)) out.push(s); });
    return out;
  }
  const legacy = content.tabs || {};
  return DEFAULT_TABS.map((d) => ({ ...d, enabled: legacy[d.key] !== undefined ? !!legacy[d.key] : d.enabled }));
}

export default function Admin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<(typeof NAV)[number]["id"]>("Overview");
  const [biz, setBiz] = useState<Biz | null>(null);
  const [content, setContent] = useState<Content>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quota, setQuota] = useState({ reel_packs_used: 0, photos_used: 0 });
  const [leadsCount, setLeadsCount] = useState(0);
  const [mediaProvider, setMediaProvider] = useState("off");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // catalogue drafts
  const [drafts, setDrafts] = useState<Record<string, Partial<Product>>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // website editor
  const [siteTabs, setSiteTabs] = useState<Tab[]>(DEFAULT_TABS);
  const [pages, setPages] = useState<Record<string, string>>({});
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [expandedPage, setExpandedPage] = useState<string | null>(null);
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  // reels
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null);
  const [reelProduct, setReelProduct] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [reelKind, setReelKind] = useState<"video" | "image">("video");
  const [portfolio, setPortfolio] = useState<PortfolioSite[]>([]);
  useEffect(() => {
    fetchJson<{ businesses: PortfolioSite[] }>("/api/auth/me").then((r) => {
      if (r.ok && r.data?.businesses) setPortfolio(r.data.businesses);
    });
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetchJson<{
      business: Biz; content: Content; products: Product[]; reels: Reel[];
      quota: { reel_packs_used: number; photos_used: number };
      leads_count: number; media_provider: string;
    }>(`/api/business/${id}`);
    if (!r.ok || !r.data) return;
    const d = r.data;
    setBiz(d.business);
    setContent(d.content || {});
    setSiteTabs(resolveTabs(d.content || {}));
    setPages((d.content || {}).pages || {});
    setProducts(d.products || []);
    setReels(d.reels || []);
    setQuota(d.quota);
    setLeadsCount(d.leads_count);
    setMediaProvider(d.media_provider || "off");
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  // deep link: /admin/[id]?tab=Catalogue
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && NAV.some((n) => n.id === t)) setTab(t as (typeof NAV)[number]["id"]);
  }, []);

  useEffect(() => {
    const working = products.some((p) => p.status === "processing") || reels.some((r) => r.status === "generating");
    if (!working) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [products, reels, refresh]);

  useEffect(() => {
    if (tab === "Leads") {
      fetchJson<{ leads: Lead[] }>(`/api/business/${id}/leads`).then((r) => {
        if (r.ok && r.data) setLeads(r.data.leads || []);
      });
    }
  }, [tab, id]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  const patchBiz = async (body: Record<string, unknown>, msg = "Saved") => {
    const r = await fetchJson(`/api/business/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    flash(r.ok ? msg : r.error);
    await refresh();
  };

  const saveContent = (patch: Partial<Content>, msg = "Saved") =>
    patchBiz({ content: { ...content, tabs_config: siteTabs, pages, ...patch } }, msg);

  const uploadLogo = async (files: FileList | null) => {
    if (!files?.[0]) return;
    const fd = new FormData();
    fd.append("file", files[0]);
    const r = await fetchJson(`/api/business/${id}/logo`, { method: "POST", body: fd });
    flash(r.ok ? "Logo updated" : r.error);
    if (logoRef.current) logoRef.current.value = "";
    await refresh();
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const fd = new FormData();
    for (const f of Array.from(files)) {
      const small = await downscaleImage(f);
      if (small) fd.append("files", small);
    }
    if (!fd.getAll("files").length) {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      return flash("Couldn't read those photos — use JPG or PNG.");
    }
    const r = await fetchJson(`/api/business/${id}/photos`, { method: "POST", body: fd });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) flash(r.error);
    await refresh();
  };

  const draft = (p: Product): Product => ({ ...p, ...(drafts[p.id] || {}) });
  const setDraft = (pid: string, field: string, value: unknown) => {
    setDrafts((d) => ({ ...d, [pid]: { ...(d[pid] || {}), [field]: value } }));
    setSavedIds((s) => { const n = new Set(s); n.delete(pid); return n; });
  };
  const saveProduct = async (pid: string) => {
    const d = drafts[pid];
    if (!d) { setSavedIds((s) => new Set(s).add(pid)); return; }
    const r = await fetchJson(`/api/products/${pid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    if (r.ok) { setSavedIds((s) => new Set(s).add(pid)); flash("Product saved"); await refresh(); }
    else flash(r.error);
  };
  const deleteProduct = async (pid: string) => {
    await fetchJson(`/api/products/${pid}`, { method: "DELETE" });
    await refresh();
    flash("Removed");
  };

  const getInspiration = async () => {
    setIdeasBusy(true);
    setIdeas(null);
    const r = await fetchJson<{ ideas: Idea[] }>(`/api/business/${id}/inspiration`, { method: "POST" });
    setIdeasBusy(false);
    if (r.ok && r.data) setIdeas(r.data.ideas);
    else flash(r.error);
  };

  const selectIdea = (i: number) => {
    setSelectedIdea(i);
    if (ideas?.[i]) setBrief(`${ideas[i].hook} — ${ideas[i].description}`);
  };

  const makeReels = async () => {
    if (!reelProduct) return;
    setBusy(true);
    const r = await fetchJson(`/api/business/${id}/reels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: reelProduct, brief, kind: reelKind }),
    });
    setBusy(false);
    flash(r.ok ? "Generating 2 reels — a few minutes" : r.error);
    if (r.ok) { setReelProduct(null); setBrief(""); setSelectedIdea(null); }
    await refresh();
  };

  const addCustomTab = () => {
    const label = newTabName.trim();
    if (!label) return;
    const key = "custom-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
    if (siteTabs.some((t) => t.key === key)) return flash("That tab already exists");
    setSiteTabs([...siteTabs, { key, label, enabled: true, builtin: false, text: true }]);
    setNewTabName("");
    setAddingTab(false);
  };

  if (!biz) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  const siteUrl = `/s/${biz.slug}`;
  const readyProducts = products.filter((p) => p.status === "ready");
  const packsLeft = 2 - quota.reel_packs_used;

  return (
    <AppShell
      items={NAV.map(({ id: t, icon }) => ({
        label: t,
        icon,
        active: tab === t,
        onClick: () => setTab(t),
        badge: t === "Leads" ? leadsCount : undefined,
      }))}
      userName={biz.name}
      portfolio={{ currentId: id, sites: portfolio.length ? portfolio : [{ id, name: biz.name, slug: biz.slug, status: biz.status }] }}
      breadcrumb={
        <span className="flex items-center gap-2 min-w-0">
          {biz.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={biz.logo_url} alt="" className="w-6 h-6 rounded-md object-contain border border-slate-200" />
          )}
          <b className="text-slate-800 truncate">{biz.name}</b>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
            biz.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}>{biz.status}</span>
        </span>
      }
      actions={
        <span className="flex items-center gap-2">
          <Link href="/start" className="btn-secondary !py-1.5 !text-xs max-sm:!hidden"><Plus size={13} /> Create Website</Link>
          <Link href={`/studio/${id}`} className="btn-primary !py-1.5 !text-xs"><Wand2 size={13} /> Studio</Link>
          <a href={siteUrl} target="_blank" className="btn-secondary !py-1.5 !text-xs"><ExternalLink size={12} /> View site</a>
        </span>
      }
    >
      {toast && (
        <div className="fixed top-24 right-5 z-50 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-5">
        {tab === "Overview" && (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              <Stat icon={Package} label="Catalogue items" value={String(readyProducts.length)} />
              <Stat icon={Inbox} label="Enquiries" value={String(leadsCount)} />
              <Stat icon={Clapperboard} label="Reels created" value={String(reels.filter((r) => r.status === "ready").length)} />
            </div>
            <div className="card p-5">
              <p className="font-semibold mb-1.5 text-sm">Your website</p>
              <a href={siteUrl} target="_blank" className="text-blue-600 text-sm underline underline-offset-4">
                {typeof window !== "undefined" ? window.location.host : ""}{siteUrl}
              </a>
              <div className="mt-4 flex gap-2">
                {biz.status !== "published" ? (
                  <button onClick={() => patchBiz({ status: "published" }, "Published!")} className="btn-primary !py-2 !text-xs">
                    Publish
                  </button>
                ) : (
                  <button onClick={() => patchBiz({ status: "draft" }, "Unpublished")} className="btn-secondary !py-2 !text-xs">
                    Unpublish
                  </button>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.origin + siteUrl); flash("Link copied"); }}
                  className="btn-secondary !py-2 !text-xs">
                  <CopyIcon size={13} /> Copy link
                </button>
              </div>
            </div>
          </>
        )}

        {tab === "Catalogue" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{quota.photos_used}/12 photos · edit details and press <b>Save</b></p>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => uploadPhotos(e.target.files)} />
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary !py-2 !text-xs">
                <ImagePlus size={14} /> {busy ? "Uploading…" : "Add photos"}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {products.map((p0) => {
                const p = draft(p0);
                const saved = savedIds.has(p.id);
                const dirty = !!drafts[p.id] && !saved;
                return (
                  <div key={p.id} className="card overflow-hidden flex">
                    {p0.status === "processing" ? (
                      <div className="w-28 shrink-0 shimmer" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p0.processed_url || p0.original_url} alt={p.title} className="w-28 shrink-0 object-cover" />
                    )}
                    <div className="p-3.5 flex-1 min-w-0">
                      {p0.status === "processing" ? (
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-2">
                          <Sparkles size={13} /> Polishing & writing…
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
                          <div className="col-span-2">
                            <label className="field-label !mb-0.5">Name</label>
                            <input value={p.title} onChange={(e) => setDraft(p.id, "title", e.target.value)} className="inp !py-1 !text-sm" />
                          </div>
                          <div>
                            <label className="field-label !mb-0.5">Category</label>
                            <input value={p.category} onChange={(e) => setDraft(p.id, "category", e.target.value)} className="inp !py-1 !text-sm" />
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="field-label !mb-0.5">Price</label>
                              <input value={p.price_text} placeholder="₹1,499" onChange={(e) => setDraft(p.id, "price_text", e.target.value)} className="inp !py-1 !text-sm" />
                            </div>
                            <div className="w-16">
                              <label className="field-label !mb-0.5">Disc%</label>
                              <input type="number" min={0} max={90} value={p.discount_pct || ""} onChange={(e) => setDraft(p.id, "discount_pct", Number(e.target.value) || 0)} className="inp !py-1 !text-sm" />
                            </div>
                          </div>
                          <div className="col-span-2">
                            <label className="field-label !mb-0.5">Description</label>
                            <textarea value={p.description} rows={2} onChange={(e) => setDraft(p.id, "description", e.target.value)} className="inp !py-1 !text-sm" />
                          </div>
                          <div className="col-span-2 flex items-center justify-between pt-0.5">
                            <div className="flex items-center gap-2.5">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" title="Show this item on your website">
                                <button
                                  role="switch" aria-checked={p0.visible}
                                  onClick={() => fetchJson(`/api/products/${p.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ visible: !p0.visible }),
                                  }).then(refresh)}
                                  className={`w-8 h-4.5 rounded-full relative transition cursor-pointer ${p0.visible ? "bg-emerald-500" : "bg-slate-300"}`}
                                  style={{ height: "18px" }}>
                                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${p0.visible ? "left-4" : "left-0.5"}`} />
                                </button>
                                <span className={p0.visible ? "text-emerald-600" : "text-slate-400"}>
                                  {p0.visible ? "On website" : "Hidden"}
                                </span>
                              </label>
                              <button onClick={() => deleteProduct(p.id)} className="flex items-center gap-1 text-xs text-red-500 cursor-pointer">
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                            <button onClick={() => saveProduct(p.id)}
                              className={saved && !dirty ? "btn-secondary !py-1 !px-3 !text-xs" : "btn-primary !py-1 !px-3 !text-xs"}>
                              {saved && !dirty ? (<><Check size={12} /> Saved</>) : (<><Save size={12} /> Save</>)}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {!products.length && (
                <p className="col-span-full text-center text-slate-400 py-14">No photos yet — add your first ones.</p>
              )}
            </div>
          </>
        )}

        {tab === "Website" && (
          <div className="max-w-3xl space-y-4">
            {/* Branding */}
            <Section icon={Palette} title="Branding" subtitle="Logo, template, colors & font">
              <div className="flex items-center gap-4 mb-4">
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files)} />
                {biz.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={biz.logo_url} alt="logo" className="w-12 h-12 rounded-lg object-contain border border-slate-200" />
                ) : (
                  <div className="w-12 h-12 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-300">
                    <ImagePlus size={17} />
                  </div>
                )}
                <button onClick={() => logoRef.current?.click()} className="btn-secondary !py-1.5 !text-xs">
                  <Upload size={13} /> {biz.logo_url ? "Change logo" : "Upload logo"}
                </button>
                {biz.logo_url && (
                  <button onClick={() => fetchJson(`/api/business/${id}/logo`, { method: "DELETE" }).then(refresh)}
                    className="text-xs text-red-500 cursor-pointer">Remove</button>
                )}
              </div>
              <label className="field-label">Template</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {["elegant", "bold", "professional", "minimal"].map((tp) => (
                  <button key={tp} onClick={() => patchBiz({ template: tp }, "Template changed")}
                    className={`px-3.5 py-1.5 rounded-lg text-sm border capitalize cursor-pointer transition ${
                      biz.template === tp ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300 hover:border-blue-400"
                    }`}>
                    {tp}
                  </button>
                ))}
              </div>
              <label className="field-label">Accent color</label>
              <div className="flex gap-2 mb-4">
                {[["blue", "bg-blue-600"], ["amber", "bg-amber-700"], ["violet", "bg-violet-600"],
                  ["emerald", "bg-emerald-700"], ["rose", "bg-rose-700"], ["sky", "bg-sky-700"], ["stone", "bg-stone-800"]].map(([c, cls]) => (
                  <button key={c} title={c} onClick={() => saveContent({ accent: c }, `Accent → ${c}`)}
                    className={`w-8 h-8 rounded-full ${cls} cursor-pointer transition ring-offset-2 ${
                      content.accent === c ? "ring-2 ring-slate-900" : "hover:scale-110"
                    }`} />
                ))}
              </div>
              <label className="field-label flex items-center gap-1"><Type size={12} /> Heading font</label>
              <div className="flex gap-2">
                {[["serif", "Classic serif"], ["sans", "Modern sans"], ["strong", "Strong caps"]].map(([f, label]) => (
                  <button key={f} onClick={() => saveContent({ font: f }, `Font → ${label}`)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm border cursor-pointer transition ${
                      (content.font || "") === f ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300 hover:border-blue-400"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </Section>

            {/* Hero */}
            <Section icon={Sparkles} title="Hero" subtitle="The first thing visitors see">
              <EditableFields
                fields={[
                  { key: "headline", label: "Headline", value: content.headline || "" },
                  { key: "tagline", label: "Tagline", value: content.tagline || "" },
                  { key: "cta_label", label: "Button label", value: content.cta_label || "" },
                ]}
                onSave={(vals) => saveContent(vals, "Hero updated")}
              />
            </Section>

            {/* About */}
            <Section icon={Globe} title="About" subtitle="Your story">
              <EditableFields
                fields={[{ key: "about", label: "About text", value: content.about || "", rows: 4 }]}
                onSave={(vals) => saveContent(vals, "About updated")}
              />
            </Section>

            {/* Services */}
            <Section icon={Package} title="What we do" subtitle="Three service highlights">
              <ServicesEditor
                services={content.services || []}
                onSave={(services) => saveContent({ services }, "Services updated")}
              />
            </Section>

            {/* Pages & tabs */}
            <Section icon={LayoutDashboard} title="Pages & tabs" subtitle="Rename, reorder visibility, add pages, edit their text">
              <div className="space-y-2">
                {siteTabs.map((t) => (
                  <div key={t.key} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className={`flex items-center gap-3 px-3.5 py-2.5 ${t.enabled ? "bg-blue-50/40" : "bg-white"}`}>
                      <button
                        onClick={() => setSiteTabs(siteTabs.map((x) => (x.key === t.key ? { ...x, enabled: !x.enabled } : x)))}
                        className={`w-5 h-5 rounded flex items-center justify-center cursor-pointer transition ${
                          t.enabled ? "bg-blue-600 text-white" : "border-2 border-slate-300"
                        }`}>
                        {t.enabled && <Check size={12} />}
                      </button>
                      {editingTab === t.key ? (
                        <input autoFocus defaultValue={t.label}
                          onBlur={(e) => {
                            const label = e.target.value.trim() || t.label;
                            setSiteTabs(siteTabs.map((x) => (x.key === t.key ? { ...x, label } : x)));
                            setEditingTab(null);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          className="flex-1 text-sm font-medium border-b border-blue-400 outline-none bg-transparent" />
                      ) : (
                        <span className="flex-1 text-sm font-medium">{t.label}</span>
                      )}
                      <button onClick={() => setEditingTab(t.key)} className="text-slate-400 hover:text-blue-600 cursor-pointer">
                        <Pencil size={13} />
                      </button>
                      {t.text && (
                        <button onClick={() => setExpandedPage(expandedPage === t.key ? null : t.key)}
                          className="flex items-center gap-1 text-xs text-blue-600 cursor-pointer">
                          Content {expandedPage === t.key ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      )}
                      {!t.builtin && (
                        <button onClick={() => setSiteTabs(siteTabs.filter((x) => x.key !== t.key))}
                          className="text-slate-400 hover:text-red-500 cursor-pointer"><X size={14} /></button>
                      )}
                    </div>
                    {t.text && expandedPage === t.key && (
                      <div className="p-3.5 border-t border-slate-200 bg-white">
                        <textarea
                          value={pages[t.key] || ""}
                          onChange={(e) => setPages({ ...pages, [t.key]: e.target.value })}
                          rows={6}
                          placeholder={`Write the content for "${t.label}" — separate paragraphs with a blank line.`}
                          className="inp !text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
                {addingTab ? (
                  <div className="flex items-center gap-3 border border-blue-300 rounded-xl px-3.5 py-2.5">
                    <Plus size={15} className="text-blue-600" />
                    <input autoFocus value={newTabName} onChange={(e) => setNewTabName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCustomTab()}
                      placeholder="Tab name, e.g. Workshops" className="flex-1 text-sm outline-none" />
                    <button onClick={addCustomTab} className="text-sm font-semibold text-blue-600 cursor-pointer">Add</button>
                    <button onClick={() => setAddingTab(false)} className="text-slate-400 cursor-pointer"><X size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => setAddingTab(true)}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 hover:text-blue-600 hover:border-blue-400 cursor-pointer transition">
                    <Plus size={14} /> Add a tab
                  </button>
                )}
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={() => saveContent({}, "Pages saved")} className="btn-primary !py-1.5 !text-xs">
                  <Save size={13} /> Save pages
                </button>
              </div>
            </Section>

            {/* Contact */}
            <Section icon={MessageCircle} title="Contact info" subtitle="Where enquiries reach you">
              <EditableBizFields biz={biz} onSave={(vals) => patchBiz(vals, "Contact updated")} />
            </Section>
          </div>
        )}

        {tab === "Reels" && (
          <div className="space-y-4">
            {mediaProvider === "off" && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm">
                The AI video provider is not connected — reels switch on when a provider key is added.
              </div>
            )}

            {/* Step 1: Inspiration */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-sm flex items-center gap-2">
                  <Lightbulb size={16} className="text-blue-600" /> Step 1 — Get inspiration
                  <span className="text-slate-400 font-normal">(optional)</span>
                </p>
                <button onClick={getInspiration} disabled={ideasBusy} className="btn-secondary !py-1.5 !text-xs">
                  <Sparkles size={13} /> {ideasBusy ? "Searching the web…" : ideas ? "Refresh ideas" : "Get inspiration"}
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                We search the web for reel trends in your industry and turn them into ready-to-use ideas.
              </p>
              {ideasBusy && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-xl shimmer" />)}
                </div>
              )}
              {ideas && !ideasBusy && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {ideas.map((idea, i) => (
                    <button key={i} onClick={() => selectIdea(i)}
                      className={`text-left rounded-xl border p-3.5 cursor-pointer transition ${
                        selectedIdea === i ? "border-blue-600 ring-2 ring-blue-600/15 bg-blue-50/40" : "border-slate-200 hover:border-blue-300"
                      }`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm">{idea.title}</p>
                        {selectedIdea === i && <Check size={15} className="text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-xs text-blue-700 mt-1">&ldquo;{idea.hook}&rdquo;</p>
                      <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{idea.description}</p>
                      <p className="text-[10px] text-slate-400 mt-1.5 uppercase tracking-wide">{idea.source}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Make reel */}
            <div className="card p-5">
              <p className="font-semibold text-sm flex items-center gap-2 mb-1">
                <Clapperboard size={16} className="text-blue-600" /> Step 2 — Make your reel
              </p>
              <p className="text-xs text-slate-500 mb-3">
                Pick a product · {packsLeft > 0 ? `${packsLeft} pack${packsLeft === 1 ? "" : "s"} left (2 reels each)` : "no packs left in this preview"}
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {readyProducts.map((p) => (
                  <button key={p.id} onClick={() => setReelProduct(reelProduct === p.id ? null : p.id)}
                    disabled={packsLeft <= 0 || mediaProvider === "off"}
                    className="shrink-0 w-24 cursor-pointer disabled:opacity-40 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.processed_url || p.original_url} alt={p.title}
                      className={`w-24 h-24 object-cover rounded-xl border-2 transition ${
                        reelProduct === p.id ? "border-blue-600 ring-2 ring-blue-600/20" : "border-transparent group-hover:border-blue-300"
                      }`} />
                    <p className="text-[11px] mt-1 truncate text-center">{p.title}</p>
                  </button>
                ))}
                {!readyProducts.length && <p className="text-sm text-slate-400 py-4">Add catalogue photos first.</p>}
              </div>
              {reelProduct && (
                <div className="mt-3 space-y-3 step-enter">
                  <div className="flex gap-2">
                    {([["video", "🎬 Video reel"], ["image", "🖼️ Image post"]] as ["video" | "image", string][]).map(([k, label]) => (
                      <button key={k} onClick={() => setReelKind(k)}
                        className={`px-3.5 py-1.5 rounded-lg text-sm border cursor-pointer transition ${
                          reelKind === k ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300 hover:border-blue-400"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="field-label">Describe your reel {selectedIdea !== null && <span className="text-blue-600 normal-case">(from your selected idea — edit freely)</span>}</label>
                    <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
                      placeholder="e.g. Slow elegant close-up with festive lighting, Diwali offer mood, warm golden tones"
                      className="inp !text-sm" />
                  </div>
                  <button onClick={makeReels} disabled={busy} className="btn-primary !text-sm">
                    <Wand2 size={15} /> {busy ? "Starting…" : reelKind === "image" ? "Generate 2 image posts" : "Generate 2 reels"}
                  </button>
                </div>
              )}
            </div>

            {/* Reel gallery */}
            {reels.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {reels.map((r) => (
                  <div key={r.id} className="card overflow-hidden">
                    {r.status === "ready" ? (
                      r.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.video_url} alt={r.variant} className="aspect-[9/16] w-full object-cover" />
                      ) : (
                        <video src={r.video_url} controls playsInline className="aspect-[9/16] w-full object-cover bg-black" />
                      )
                    ) : r.status === "failed" ? (
                      <div className="aspect-[9/16] flex items-center justify-center text-xs text-red-500 p-4 text-center">
                        Failed: {r.error?.slice(0, 70)}
                      </div>
                    ) : (
                      <div className="aspect-[9/16] shimmer flex items-end justify-center pb-5">
                        <p className="text-xs text-slate-500">Generating…</p>
                      </div>
                    )}
                    <div className="p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs capitalize text-slate-500">{r.variant}{r.kind === "image" ? " · post" : ""}</span>
                        {r.status === "ready" && (
                          <a href={r.video_url} download className="text-xs font-semibold text-blue-600">Download ↓</a>
                        )}
                      </div>
                      {r.status === "ready" && (
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-0.5">Post</span>
                          <a title="Share on WhatsApp" target="_blank"
                            href={`https://wa.me/?text=${encodeURIComponent((typeof window !== "undefined" ? window.location.origin : "") + r.video_url)}`}
                            className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center hover:scale-110 transition">
                            <MessageCircle size={12} />
                          </a>
                          <a title="Open Instagram (download first, then upload)" target="_blank" href="https://www.instagram.com/"
                            className="w-6 h-6 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center hover:scale-110 transition">
                            <InstagramIcon size={12} />
                          </a>
                          <a title="Share on Facebook" target="_blank"
                            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent((typeof window !== "undefined" ? window.location.origin : "") + r.video_url)}`}
                            className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:scale-110 transition">
                            <FacebookIcon size={12} />
                          </a>
                          <a title="Share on X" target="_blank"
                            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent((typeof window !== "undefined" ? window.location.origin : "") + r.video_url)}`}
                            className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center hover:scale-110 transition">
                            <TwitterIcon size={12} />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Leads" && (
          <div className="card overflow-hidden">
            {leads.length ? (<>
              <div className="sm:hidden divide-y divide-slate-100">
                {leads.map((l) => (
                  <div key={l.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{l.name || l.phone}</p>
                      <span className="text-xs text-slate-400">
                        {new Date(l.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{l.phone}</p>
                    {l.message && <p className="text-sm mt-1.5">{l.message}</p>}
                    <a href={`https://wa.me/${l.phone.replace(/\D/g, "").length === 10 ? "91" : ""}${l.phone.replace(/\D/g, "")}`}
                      target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 mt-2">
                      <MessageCircle size={13} /> Reply on WhatsApp
                    </a>
                  </div>
                ))}
              </div>
              <table className="w-full text-sm hidden sm:table">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Phone</th>
                    <th className="px-4 py-2.5 font-medium">Message</th>
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">{l.name || "—"}</td>
                      <td className="px-4 py-2.5">{l.phone}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate">{l.message}</td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {new Date(l.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-4 py-2.5">
                        <a href={`https://wa.me/${l.phone.replace(/\D/g, "").length === 10 ? "91" : ""}${l.phone.replace(/\D/g, "")}`}
                          target="_blank" className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <MessageCircle size={13} /> Reply
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>) : (
              <p className="text-center text-slate-400 py-14">
                No enquiries yet — share your website link on WhatsApp Status and Instagram.
              </p>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string }) {
  return (
    <div className="card p-4 flex items-center gap-3.5">
      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function Section({
  icon: Icon, title, subtitle, children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Icon size={15} />
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">{title}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function EditableFields({
  fields, onSave,
}: {
  fields: { key: string; label: string; value: string; rows?: number }[];
  onSave: (vals: Record<string, string>) => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.value]))
  );
  const dirty = fields.some((f) => vals[f.key] !== f.value);
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="field-label">{f.label}</label>
          {f.rows ? (
            <textarea value={vals[f.key]} rows={f.rows} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} className="inp !text-sm" />
          ) : (
            <input value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} className="inp !text-sm" />
          )}
        </div>
      ))}
      <div className="flex justify-end">
        <button onClick={() => onSave(vals)} className={dirty ? "btn-primary !py-1.5 !text-xs" : "btn-secondary !py-1.5 !text-xs"}>
          <Save size={13} /> Save
        </button>
      </div>
    </div>
  );
}

function ServicesEditor({
  services, onSave,
}: {
  services: { title: string; desc: string }[];
  onSave: (s: { title: string; desc: string }[]) => void;
}) {
  const [items, setItems] = useState(services.length ? services : [{ title: "", desc: "" }, { title: "", desc: "" }, { title: "", desc: "" }]);
  return (
    <div className="space-y-2.5">
      {items.map((s, i) => (
        <div key={i} className="grid grid-cols-3 gap-2.5">
          <input value={s.title} placeholder="Service"
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
            className="inp !py-1.5 !text-sm col-span-1" />
          <input value={s.desc} placeholder="One-line description"
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))}
            className="inp !py-1.5 !text-sm col-span-2" />
        </div>
      ))}
      <div className="flex justify-end">
        <button onClick={() => onSave(items.filter((s) => s.title.trim()))} className="btn-primary !py-1.5 !text-xs">
          <Save size={13} /> Save
        </button>
      </div>
    </div>
  );
}

function EditableBizFields({
  biz, onSave,
}: {
  biz: { phone: string; whatsapp: string; city: string };
  onSave: (vals: Record<string, string>) => void;
}) {
  const [vals, setVals] = useState({ phone: biz.phone, whatsapp: biz.whatsapp, city: biz.city });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {(["phone", "whatsapp", "city"] as const).map((k) => (
          <div key={k}>
            <label className="field-label capitalize">{k}</label>
            <input value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} className="inp !py-1.5 !text-sm" />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={() => onSave(vals)} className="btn-primary !py-1.5 !text-xs">
          <Save size={13} /> Save
        </button>
      </div>
    </div>
  );
}
