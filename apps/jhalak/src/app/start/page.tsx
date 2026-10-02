"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Store, Scissors, Stethoscope, Dumbbell, UtensilsCrossed, Briefcase,
  Check, Pencil, Plus, Upload, ArrowRight, ArrowLeft, Sparkles, ImagePlus,
  Globe, FileText, X, Save, LayoutTemplate,
} from "lucide-react";
import { fetchJson, downscaleImage } from "@/lib/client";
import SmartTextarea from "@/components/SmartTextarea";
import AppShell from "@/components/AppShell";
import ShowcaseCarousel from "@/components/ShowcaseCarousel";
import ImportFlow from "./ImportFlow";
import { LayoutDashboard, Package, Clapperboard, Inbox, Wand2 } from "lucide-react";

type SiteCopy = {
  headline: string; tagline: string; about: string;
  services: { title: string; desc: string }[]; cta_label: string;
};
type Product = {
  id: string; title: string; description: string; category: string;
  price_text: string; discount_pct: number; status: string;
  original_url: string; processed_url: string;
};
type Tab = { key: string; label: string; enabled: boolean; builtin: boolean; text: boolean };

const CATEGORIES = [
  { id: "boutique", label: "Boutique / Store", icon: Store },
  { id: "salon", label: "Salon / Spa", icon: Scissors },
  { id: "clinic", label: "Clinic", icon: Stethoscope },
  { id: "gym", label: "Gym / Fitness", icon: Dumbbell },
  { id: "restaurant", label: "Restaurant / Café", icon: UtensilsCrossed },
  { id: "other", label: "Other", icon: Briefcase },
];

const DEFAULT_TABS: Tab[] = [
  { key: "products", label: "Our Products", enabled: true, builtin: true, text: false },
  { key: "about", label: "About Us", enabled: true, builtin: true, text: false },
  { key: "gallery", label: "Gallery", enabled: false, builtin: true, text: false },
  { key: "contact", label: "Contact", enabled: true, builtin: true, text: false },
  { key: "pricing", label: "Pricing", enabled: false, builtin: true, text: true },
  { key: "terms", label: "Terms & Conditions", enabled: false, builtin: true, text: true },
  { key: "faq", label: "FAQ", enabled: false, builtin: true, text: true },
];

const TEMPLATES = [
  {
    id: "elegant", title: "Elegant", desc: "Warm & classic — boutiques, designers",
    preview: (
      <div className="h-36 rounded-lg bg-[#f6f1e9] border border-stone-200 p-3 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="w-14 h-2 rounded bg-stone-700" />
          <div className="w-10 h-3 rounded-full bg-amber-800" />
        </div>
        <div className="flex gap-2 flex-1">
          <div className="flex-1 flex flex-col justify-center gap-1.5">
            <div className="w-full h-3 rounded bg-stone-800" />
            <div className="w-4/5 h-3 rounded bg-stone-800" />
            <div className="w-3/5 h-1.5 rounded bg-stone-400" />
            <div className="w-12 h-3.5 rounded-full bg-amber-800 mt-1" />
          </div>
          <div className="w-16 rounded-md bg-gradient-to-br from-amber-200 to-amber-400" />
        </div>
      </div>
    ),
  },
  {
    id: "bold", title: "Bold", desc: "Dark & confident — gyms, studios",
    preview: (
      <div className="h-36 rounded-lg bg-stone-950 p-3 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="w-14 h-2 rounded bg-white" />
          <div className="w-10 h-3 rounded-full bg-violet-500" />
        </div>
        <div className="flex gap-2 flex-1">
          <div className="flex-1 flex flex-col justify-center gap-1.5">
            <div className="w-full h-3.5 rounded bg-white" />
            <div className="w-3/4 h-3.5 rounded bg-white" />
            <div className="w-1/2 h-1.5 rounded bg-stone-600" />
            <div className="w-12 h-3.5 rounded-full bg-violet-500 mt-1" />
          </div>
          <div className="w-16 rounded-md bg-gradient-to-br from-violet-400 to-violet-700" />
        </div>
      </div>
    ),
  },
  {
    id: "professional", title: "Professional", desc: "Clean & corporate — clinics, services",
    preview: (
      <div className="h-36 rounded-lg bg-slate-50 border border-slate-200 p-3 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between bg-white -m-3 mb-0 p-2 border-b border-slate-200">
          <div className="w-14 h-2 rounded bg-slate-700" />
          <div className="w-10 h-3 rounded-full bg-blue-600" />
        </div>
        <div className="flex gap-2 flex-1 pt-1">
          <div className="flex-1 flex flex-col justify-center gap-1.5">
            <div className="w-full h-3 rounded bg-slate-800" />
            <div className="w-2/3 h-1.5 rounded bg-slate-400" />
            <div className="flex gap-1 mt-1">
              <div className="w-10 h-6 rounded bg-white border border-slate-200" />
              <div className="w-10 h-6 rounded bg-white border border-slate-200" />
              <div className="w-10 h-6 rounded bg-white border border-slate-200" />
            </div>
          </div>
          <div className="w-16 rounded-md bg-gradient-to-br from-blue-200 to-blue-500" />
        </div>
      </div>
    ),
  },
  {
    id: "minimal", title: "Minimal", desc: "Airy & understated — studios, cafés",
    preview: (
      <div className="h-36 rounded-lg bg-white border border-neutral-200 p-3 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="w-14 h-2 rounded bg-neutral-400" />
          <div className="w-10 h-2 rounded bg-neutral-300" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5">
          <div className="w-2/3 h-3 rounded bg-neutral-800" />
          <div className="w-1/2 h-1.5 rounded bg-neutral-300" />
          <div className="w-11 h-3 rounded-full border border-neutral-400 mt-1" />
        </div>
      </div>
    ),
  },
];

export default function StartWizard() {
  const router = useRouter();
  const [path, setPath] = useState<"choose" | "fresh" | "import">("choose");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [category, setCategory] = useState("boutique");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("english");
  const [bizId, setBizId] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);

  const [template, setTemplate] = useState("elegant");
  const [accent, setAccent] = useState("amber");
  const [me, setMe] = useState<{ user: { name: string } | null; businesses?: { id: string }[] } | null>(null);
  useEffect(() => {
    fetchJson<{ user: { name: string } | null; businesses?: { id: string }[] }>("/api/auth/me")
      .then((r) => { if (r.ok && r.data) setMe(r.data); });
  }, []);

  const pickStyle = async (t: string, a: string) => {
    setTemplate(t);
    setAccent(a);
    if (bizId) {
      await fetchJson(`/api/business/${bizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: t, content: { accent: a } }),
      });
    }
  };

  const [tabs, setTabs] = useState<Tab[]>(DEFAULT_TABS);
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [newTabName, setNewTabName] = useState("");
  const [addingTab, setAddingTab] = useState(false);
  const [refUrl, setRefUrl] = useState("");
  const [refStatus, setRefStatus] = useState("");
  const docRef = useRef<HTMLInputElement>(null);

  const [offering, setOffering] = useState("");
  const [special, setSpecial] = useState("");
  const [action, setAction] = useState("");
  const [copy, setCopy] = useState<SiteCopy | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<Product>>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const createBusiness = async () => {
    if (!name.trim()) return setError("Please enter your business name");
    setBusy(true);
    setError("");
    const r = await fetchJson<{ id: string; slug: string }>("/api/business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, city, phone, whatsapp: phone, language, template }),
    });
    setBusy(false);
    if (r.status === 401) return router.push("/signup?next=/start");
    if (!r.ok || !r.data) return setError(r.error);
    setBizId(r.data.id);
    setStep(2);
  };

  const uploadLogo = async (files: FileList | null) => {
    if (!files?.[0] || !bizId) return;
    const fd = new FormData();
    fd.append("file", files[0]);
    const r = await fetchJson<{ logo_url: string }>(`/api/business/${bizId}/logo`, { method: "POST", body: fd });
    if (r.ok && r.data) setLogoUrl(r.data.logo_url);
    else setError(r.error);
    if (logoRef.current) logoRef.current.value = "";
  };

  const saveTemplate = (t: string) => pickStyle(t, accent);

  const saveStructure = async () => {
    setBusy(true);
    await fetchJson(`/api/business/${bizId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { tabs_config: tabs, accent } }),
    });
    setBusy(false);
    setStep(4);
  };

  const addCustomTab = () => {
    const label = newTabName.trim();
    if (!label) return;
    const key = "custom-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
    if (tabs.some((t) => t.key === key)) return setError("A tab with that name already exists");
    setTabs([...tabs, { key, label, enabled: true, builtin: false, text: true }]);
    setNewTabName("");
    setAddingTab(false);
  };

  const submitRefUrl = async () => {
    if (!refUrl.trim()) return;
    setRefStatus("Reading your website…");
    const r = await fetchJson<{ chars: number }>(`/api/business/${bizId}/reference`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: refUrl.trim() }),
    });
    setRefStatus(r.ok ? `✓ Website read — AI will use it as reference` : `✗ ${r.error}`);
  };

  const submitRefDoc = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setRefStatus("Reading your document…");
    const fd = new FormData();
    fd.append("file", files[0]);
    const r = await fetchJson<{ chars: number }>(`/api/business/${bizId}/reference`, { method: "POST", body: fd });
    setRefStatus(r.ok ? `✓ "${files[0].name}" read — AI will use it as reference` : `✗ ${r.error}`);
    if (docRef.current) docRef.current.value = "";
  };

  const generateCopy = async () => {
    if (!offering.trim()) return setError("Tell us what you offer — one line is enough");
    setBusy(true);
    setError("");
    const r = await fetchJson<{ content: SiteCopy }>(`/api/business/${bizId}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offering, special, action }),
    });
    setBusy(false);
    if (!r.ok || !r.data) return setError(r.error);
    setCopy(r.data.content);
  };

  const saveCopy = async () => {
    if (!copy) return;
    await fetchJson(`/api/business/${bizId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: copy }),
    });
    setStep(5);
  };

  const refreshProducts = useCallback(async () => {
    if (!bizId) return;
    const r = await fetchJson<{ products: Product[] }>(`/api/business/${bizId}/photos`);
    if (r.ok && r.data?.products) setProducts(r.data.products);
  }, [bizId]);

  useEffect(() => {
    if (step !== 5) return;
    refreshProducts();
    const t = setInterval(() => {
      setProducts((prev) => {
        if (prev.some((p) => p.status === "processing")) refreshProducts();
        return prev;
      });
    }, 3500);
    return () => clearInterval(t);
  }, [step, refreshProducts]);

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const fd = new FormData();
    let skipped = 0;
    for (const f of Array.from(files)) {
      const small = await downscaleImage(f);
      if (small) fd.append("files", small);
      else skipped++;
    }
    if (!fd.getAll("files").length) {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      return setError("Couldn't read those photos — please upload JPG or PNG images.");
    }
    const r = await fetchJson(`/api/business/${bizId}/photos`, { method: "POST", body: fd });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) return setError(r.error);
    if (skipped) setError(`${skipped} photo(s) couldn't be read and were skipped (use JPG/PNG).`);
    await refreshProducts();
  };

  const draft = (p: Product): Product => ({ ...p, ...(drafts[p.id] || {}) });
  const setDraft = (id: string, field: string, value: unknown) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [field]: value } }));
    setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  const saveProduct = async (id: string) => {
    const d = drafts[id];
    if (!d) { setSavedIds((s) => new Set(s).add(id)); return; }
    const r = await fetchJson(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    if (r.ok) {
      setSavedIds((s) => new Set(s).add(id));
      await refreshProducts();
    } else setError(r.error);
  };

  const stepTitle = [
    "", "Tell us about your business", "Pick your style", "Choose your pages",
    "Your story — 3 quick questions", "Add your products & photos",
  ][step];

  const shellItems = [
    { label: "Create website", icon: Sparkles, active: true },
    { label: "Dashboard", icon: LayoutDashboard, href: me?.businesses?.[0] ? `/admin/${me.businesses[0].id}` : undefined, disabled: !me?.businesses?.[0] },
    { label: "Catalogue", icon: Package, href: me?.businesses?.[0] ? `/admin/${me.businesses[0].id}?tab=Catalogue` : undefined, disabled: !me?.businesses?.[0] },
    { label: "Reels studio", icon: Clapperboard, href: me?.businesses?.[0] ? `/admin/${me.businesses[0].id}?tab=Reels` : undefined, disabled: !me?.businesses?.[0] },
    { label: "Leads", icon: Inbox, href: me?.businesses?.[0] ? `/admin/${me.businesses[0].id}?tab=Leads` : undefined, disabled: !me?.businesses?.[0] },
    ...(bizId ? [{ label: "Studio", icon: Wand2, href: `/studio/${bizId}` }] : []),
  ];

  return (
    <AppShell
      items={shellItems}
      userName={me?.user?.name || undefined}
      breadcrumb={
        path === "fresh"
          ? <span>Create website <span className="mx-1 text-slate-300">›</span> <b className="text-slate-800">Step {step} of 5</b> — {stepTitle}</span>
          : path === "import"
          ? <span>Create website <span className="mx-1 text-slate-300">›</span> <b className="text-slate-800">Import your existing site</b></span>
          : <span><b className="text-slate-800">Create your website</b></span>
      }
    >
      <div className="px-4 sm:px-6 py-6">
        {path === "choose" && (
          <div className="max-w-3xl mx-auto py-4">
            <h1 className="text-2xl font-bold tracking-tight mb-1">Let&apos;s build your website</h1>
            <p className="text-slate-500 text-sm mb-6">Two ways to start — pick whichever fits you.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <button onClick={() => setPath("fresh")}
                className="card p-6 text-left hover:!border-blue-600 hover:ring-2 hover:ring-blue-600/15 transition cursor-pointer">
                <Sparkles className="text-blue-600 mb-3" size={26} />
                <h2 className="font-semibold text-lg mb-1">Start fresh</h2>
                <p className="text-sm text-slate-500">Answer a few quick questions — you can speak them — and we&apos;ll write your site and catalogue from scratch.</p>
              </button>
              <button onClick={() => setPath("import")}
                className="card p-6 text-left hover:!border-blue-600 hover:ring-2 hover:ring-blue-600/15 transition cursor-pointer">
                <Globe className="text-blue-600 mb-3" size={26} />
                <h2 className="font-semibold text-lg mb-1">I already have a website</h2>
                <p className="text-sm text-slate-500">Paste your link — we&apos;ll read it, keep your real products, and rebuild it as a better, editable site with new images.</p>
              </button>
            </div>
          </div>
        )}
        {path === "import" && <ImportFlow onBack={() => setPath("choose")} />}
        {path === "fresh" && (<>
        <div className="h-1 bg-slate-200 rounded-full mb-6 max-w-3xl">
          <div className="h-1 bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${(step / 5) * 100}%` }} />
        </div>
        <div className="grid xl:grid-cols-[minmax(0,1fr)_310px] gap-6 items-start">
        <div className="min-w-0 card p-5 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight mb-6">{stepTitle}</h1>
      {error && (
        <div className="mb-5 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="step-enter space-y-5">
          <div>
            <label className="field-label">Business name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meera Boutique" className="inp" />
          </div>
          <div>
            <label className="field-label">Type of business</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category === c.id;
                return (
                  <button key={c.id} onClick={() => setCategory(c.id)}
                    className={`card flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer ${
                      active ? "!border-blue-600 ring-2 ring-blue-600/15 text-blue-700 font-medium" : "text-slate-600"
                    }`}>
                    <Icon size={16} className={active ? "text-blue-600" : "text-slate-400"} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Jaipur" className="inp" />
            </div>
            <div>
              <label className="field-label">WhatsApp number</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" className="inp" />
            </div>
          </div>
          <div>
            <label className="field-label">Website language</label>
            <div className="flex gap-2">
              {["english", "hinglish"].map((l) => (
                <button key={l} onClick={() => setLanguage(l)}
                  className={`px-4 py-2 rounded-lg text-sm border capitalize cursor-pointer transition ${
                    language === l ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300 hover:border-blue-400"
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button onClick={createBusiness} disabled={busy} className="btn-primary">
            Continue <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="step-enter space-y-6">
          <div className="card p-4 flex items-center gap-4">
            <input ref={logoRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => uploadLogo(e.target.files)} />
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="w-14 h-14 rounded-xl object-contain border border-slate-200 bg-white" />
            ) : (
              <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-300">
                <ImagePlus size={20} />
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold">Your logo <span className="font-normal text-slate-400">(optional)</span></p>
              <p className="text-xs text-slate-500">Shown in your website header. PNG/JPG, max 2MB.</p>
            </div>
            <button onClick={() => logoRef.current?.click()} className="btn-secondary !py-2">
              <Upload size={14} /> {logoUrl ? "Change" : "Upload"}
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => saveTemplate(t.id)}
                className={`text-left card p-3 cursor-pointer ${
                  template === t.id ? "!border-blue-600 ring-2 ring-blue-600/15" : ""
                }`}>
                {t.preview}
                <div className="mt-2.5 flex items-center justify-between px-0.5">
                  <span className="font-semibold text-sm">{t.title}</span>
                  {template === t.id && (
                    <span className="flex items-center gap-1 text-blue-600 text-xs font-semibold">
                      <Check size={13} /> Selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 px-0.5 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <LayoutTemplate size={13} /> Colors and fonts are fully adjustable later — in your dashboard or by chat.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-secondary"><ArrowLeft size={15} /> Back</button>
            <button onClick={() => setStep(3)} className="btn-primary">Continue <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="step-enter space-y-6">
          <p className="text-sm text-slate-500 -mt-2">
            Tick the pages you want. <Pencil size={12} className="inline" /> to rename any page — or add your own.
          </p>
          <div className="space-y-2">
            {tabs.map((t) => (
              <div key={t.key}
                className={`card flex items-center gap-3 px-4 py-3 ${t.enabled ? "!border-blue-600/40 bg-blue-50/30" : ""}`}>
                <button
                  onClick={() => setTabs(tabs.map((x) => (x.key === t.key ? { ...x, enabled: !x.enabled } : x)))}
                  aria-label={t.enabled ? "Disable" : "Enable"}
                  className={`w-5 h-5 rounded flex items-center justify-center cursor-pointer transition ${
                    t.enabled ? "bg-blue-600 text-white" : "border-2 border-slate-300"
                  }`}>
                  {t.enabled && <Check size={13} />}
                </button>
                {editingTab === t.key ? (
                  <input
                    autoFocus defaultValue={t.label}
                    onBlur={(e) => {
                      const label = e.target.value.trim() || t.label;
                      setTabs(tabs.map((x) => (x.key === t.key ? { ...x, label } : x)));
                      setEditingTab(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="flex-1 text-sm font-medium border-b border-blue-400 outline-none bg-transparent"
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium">{t.label}
                    {t.text && <span className="ml-2 text-[11px] text-slate-400 font-normal">text page</span>}
                  </span>
                )}
                <button onClick={() => setEditingTab(t.key)} aria-label="Rename"
                  className="text-slate-400 hover:text-blue-600 cursor-pointer transition">
                  <Pencil size={14} />
                </button>
                {!t.builtin && (
                  <button onClick={() => setTabs(tabs.filter((x) => x.key !== t.key))} aria-label="Remove"
                    className="text-slate-400 hover:text-red-500 cursor-pointer transition">
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            {addingTab ? (
              <div className="card flex items-center gap-3 px-4 py-3 !border-blue-400">
                <Plus size={16} className="text-blue-600" />
                <input autoFocus value={newTabName} onChange={(e) => setNewTabName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomTab()}
                  placeholder="Tab name, e.g. Workshops" className="flex-1 text-sm outline-none bg-transparent" />
                <button onClick={addCustomTab} className="text-sm font-semibold text-blue-600 cursor-pointer">Add</button>
                <button onClick={() => setAddingTab(false)} className="text-slate-400 cursor-pointer"><X size={15} /></button>
              </div>
            ) : (
              <button onClick={() => setAddingTab(true)}
                className="w-full card flex items-center justify-center gap-2 px-4 py-3 text-sm text-slate-500 hover:text-blue-600 cursor-pointer border-dashed">
                <Plus size={15} /> Add your own tab
              </button>
            )}
          </div>

          <div className="card p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Globe size={15} className="text-blue-600" />
              Have an existing website or brochure?
              <span className="font-normal text-slate-400">(optional)</span>
            </p>
            <div className="flex gap-2">
              <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)}
                placeholder="https://your-old-website.com" className="inp flex-1" />
              <button onClick={submitRefUrl} className="btn-secondary shrink-0 !py-2">Read it</button>
            </div>
            <input ref={docRef} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf"
              className="hidden" onChange={(e) => submitRefDoc(e.target.files)} />
            <button onClick={() => docRef.current?.click()} className="btn-secondary !py-2">
              <FileText size={14} /> Upload a document (PDF / text)
            </button>
            {refStatus && <p className="text-sm text-slate-600">{refStatus}</p>}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary"><ArrowLeft size={15} /> Back</button>
            <button onClick={saveStructure} disabled={busy} className="btn-primary">Continue <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="step-enter space-y-5">
          {!copy ? (
            <>
              <p className="text-xs text-slate-400 -mt-1 mb-1">
                Tip: tap the mic to speak your answers — English ya Hinglish, dono chalega. Use ⤢ for a bigger writing space.
              </p>
              <SmartTextarea label="1. What do you offer?" value={offering} onChange={setOffering}
                placeholder="e.g. Designer sarees and lehengas, custom stitching" rows={3} />
              <SmartTextarea label="2. What makes you special?" value={special} onChange={setSpecial}
                placeholder="e.g. 20 years of experience, everything handmade" rows={3} />
              <SmartTextarea label="3. What should visitors do?" value={action} onChange={setAction}
                placeholder="e.g. Message us on WhatsApp to book a visit" rows={2} />
              <div className="flex items-center gap-2 text-sm">
                <input ref={docRef} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf"
                  className="hidden" onChange={(e) => submitRefDoc(e.target.files)} />
                <button onClick={() => docRef.current?.click()} className="btn-secondary !py-1.5 !text-xs">
                  <FileText size={13} /> Attach a document — AI will read it
                </button>
                {refStatus && <span className="text-xs text-slate-500">{refStatus}</span>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="btn-secondary"><ArrowLeft size={15} /> Back</button>
                <button onClick={generateCopy} disabled={busy} className="btn-primary">
                  <Sparkles size={15} /> {busy ? "Writing your website…" : "Write my website"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500 -mt-1">Here&apos;s what we wrote — edit anything, or refine by chat in the next step.</p>
              <div>
                <label className="field-label">Headline</label>
                <input value={copy.headline} onChange={(e) => setCopy({ ...copy, headline: e.target.value })} className="inp text-lg font-semibold" />
              </div>
              <div>
                <label className="field-label">Tagline</label>
                <input value={copy.tagline} onChange={(e) => setCopy({ ...copy, tagline: e.target.value })} className="inp" />
              </div>
              <div>
                <label className="field-label">About</label>
                <textarea value={copy.about} onChange={(e) => setCopy({ ...copy, about: e.target.value })} rows={3} className="inp" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCopy(null)} className="btn-secondary">↻ Rewrite</button>
                <button onClick={saveCopy} disabled={busy} className="btn-primary">Looks good — continue <ArrowRight size={16} /></button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="step-enter space-y-5">
          <p className="text-sm text-slate-500 -mt-2">
            Upload photos — AI polishes each one and writes its details.
            <b> Review each card, edit anything, then press Save.</b>
          </p>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => uploadPhotos(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 py-7 text-slate-500 hover:border-blue-500 hover:text-blue-600 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
            <ImagePlus size={18} /> {busy ? "Uploading…" : "Tap to add photos"}
          </button>

          {products.map((p0) => {
            const p = draft(p0);
            const saved = savedIds.has(p.id);
            const dirty = !!drafts[p.id] && !saved;
            return (
              <div key={p.id} className="card overflow-hidden">
                <div className="flex">
                  {p0.status === "processing" ? (
                    <div className="w-32 shrink-0 shimmer min-h-32" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p0.processed_url || p0.original_url} alt={p.title} className="w-32 shrink-0 object-cover" />
                  )}
                  <div className="p-4 flex-1 min-w-0">
                    {p0.status === "processing" ? (
                      <p className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Sparkles size={13} /> Polishing photo & writing details…
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                        <div>
                          <label className="field-label !mb-1">Product name</label>
                          <input value={p.title} onChange={(e) => setDraft(p.id, "title", e.target.value)} className="inp !py-1.5 !text-sm" />
                        </div>
                        <div>
                          <label className="field-label !mb-1">Category</label>
                          <input value={p.category} onChange={(e) => setDraft(p.id, "category", e.target.value)} className="inp !py-1.5 !text-sm" />
                        </div>
                        <div>
                          <label className="field-label !mb-1">Price</label>
                          <input value={p.price_text} placeholder="₹1,499" onChange={(e) => setDraft(p.id, "price_text", e.target.value)} className="inp !py-1.5 !text-sm" />
                        </div>
                        <div>
                          <label className="field-label !mb-1">Discount %</label>
                          <input type="number" min={0} max={90} value={p.discount_pct || ""} placeholder="0"
                            onChange={(e) => setDraft(p.id, "discount_pct", Number(e.target.value) || 0)} className="inp !py-1.5 !text-sm" />
                        </div>
                        <div className="col-span-2">
                          <label className="field-label !mb-1">Description</label>
                          <textarea value={p.description} rows={2} onChange={(e) => setDraft(p.id, "description", e.target.value)} className="inp !py-1.5 !text-sm" />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <button onClick={() => saveProduct(p.id)}
                            className={saved && !dirty ? "btn-secondary !py-1.5 !text-xs" : "btn-primary !py-1.5 !text-xs"}>
                            {saved && !dirty ? (<><Check size={13} /> Saved</>) : (<><Save size={13} /> Save</>)}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="btn-secondary"><ArrowLeft size={15} /> Back</button>
            <button onClick={() => router.push(`/studio/${bizId}`)} className="btn-primary">
              {products.length ? "Continue" : "Skip"} — preview & edit by chat <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
        </div>
        <div className="hidden xl:block sticky top-[70px] h-[calc(100vh-100px)]">
          <ShowcaseCarousel onPick={pickStyle} current={`${template}-${accent}`} />
        </div>
        </div>
        </>)}
      </div>
    </AppShell>
  );
}
