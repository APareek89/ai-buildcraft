import { q } from "./db";

export type Biz = {
  id: string; slug: string; name: string; category: string; city: string;
  phone: string; whatsapp: string; language: string; template: string; status: string;
  logo_url: string;
};

export type TabConfig = {
  key: string;          // 'products' | 'about' | 'gallery' | 'contact' | 'pricing' | 'terms' | 'faq' | 'custom-*'
  label: string;
  enabled: boolean;
  builtin: boolean;
  text: boolean;        // true → rendered as a text page at /s/[slug]/t/[key]
};

// ---------- Rich section blocks (v6) ----------
// Optional, ordered, toggleable blocks stored in content.sections[]. The import
// flow auto-picks which fit the business; owners toggle/edit them in Studio.
export type SectionBase = { id: string; enabled: boolean };
export type StatsSection = SectionBase & {
  type: "stats";
  items: { value: string; label: string }[];       // e.g. { value:"20+", label:"Years" }
};
export type IndustriesSection = SectionBase & {
  type: "industries";
  title?: string;
  items: { name: string; image_url?: string }[];   // industries / clients served
};
export type TestimonialsSection = SectionBase & {
  type: "testimonials";
  title?: string;
  items: { quote: string; author: string; role?: string }[];
};
export type CertificationsSection = SectionBase & {
  type: "certifications";
  title?: string;
  items: { name: string; image_url?: string }[];
};
export type CtaBannerSection = SectionBase & {
  type: "cta_banner";
  heading: string;
  subtext?: string;
  button_label?: string;
};
export type Section =
  | StatsSection | IndustriesSection | TestimonialsSection
  | CertificationsSection | CtaBannerSection;

export const SECTION_TYPES = ["stats", "industries", "testimonials", "certifications", "cta_banner"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export type Content = {
  headline?: string; tagline?: string; about?: string;
  services?: { title: string; desc: string }[]; cta_label?: string;
  tabs?: Partial<Record<string, boolean>>;       // legacy v2 shape
  tabs_config?: TabConfig[];                     // v3 shape
  pages?: Record<string, string>;                // text content for text tabs
  accent?: string; font?: string;
  reference_text?: string; reference_source?: string;
  hero_image_url?: string;                        // generated/uploaded hero (v6)
  sections?: Section[];                           // rich ordered blocks (v6)
  business_type?: string;                         // readable descriptor (import) — eyebrow fallback
};

/** True when a section has something worth rendering (avoids empty blocks). */
export function sectionHasContent(s: Section): boolean {
  if (s.type === "cta_banner") return !!s.heading?.trim();
  return Array.isArray(s.items) && s.items.length > 0;
}

/** Enabled, non-empty section blocks in stored order — the tenant render list. */
export function enabledSections(content: Content): Section[] {
  return (content.sections || []).filter((s) => s && s.enabled && sectionHasContent(s));
}

export type Product = {
  id: string; title: string; description: string; price_text: string; category: string;
  discount_pct: number; processed_url: string; original_url: string; status: string; visible: boolean;
};

export const BUILTIN_TABS: Omit<TabConfig, "enabled">[] = [
  { key: "products", label: "Our Products", builtin: true, text: false },
  { key: "about", label: "About Us", builtin: true, text: false },
  { key: "gallery", label: "Gallery", builtin: true, text: false },
  { key: "contact", label: "Contact", builtin: true, text: false },
  { key: "pricing", label: "Pricing", builtin: true, text: true },
  { key: "terms", label: "Terms & Conditions", builtin: true, text: true },
  { key: "faq", label: "FAQ", builtin: true, text: true },
];

const DEFAULT_ON = new Set(["products", "about", "contact"]);

/** Resolve the tab configuration, merging v3 config over legacy v2 booleans over defaults. */
export function tabsConfig(content: Content): TabConfig[] {
  const legacy = content.tabs || {};
  const saved = content.tabs_config || [];
  const byKey = new Map(saved.map((t) => [t.key, t]));
  const out: TabConfig[] = BUILTIN_TABS.map((b) => {
    const s = byKey.get(b.key);
    if (s) return { ...b, ...s, builtin: true, text: b.text };
    const legacyOn = legacy[b.key];
    return { ...b, enabled: legacyOn !== undefined ? !!legacyOn : DEFAULT_ON.has(b.key) };
  });
  // custom tabs (preserve their saved order after builtins)
  for (const s of saved) {
    if (!byKey.has(s.key)) continue;
    if (!BUILTIN_TABS.some((b) => b.key === s.key)) out.push({ ...s, builtin: false, text: true });
  }
  return out;
}

export function enabledTabs(content: Content): TabConfig[] {
  return tabsConfig(content).filter((t) => t.enabled);
}

// ---------- Themes ----------

export const ACCENTS: Record<string, { text: string; bg: string; chip: string }> = {
  blue:    { text: "text-blue-700",    bg: "bg-blue-600 hover:bg-blue-700",       chip: "bg-blue-100 text-blue-900" },
  amber:   { text: "text-amber-800",   bg: "bg-amber-800 hover:bg-amber-900",     chip: "bg-amber-100 text-amber-900" },
  violet:  { text: "text-violet-600",  bg: "bg-violet-600 hover:bg-violet-700",   chip: "bg-violet-100 text-violet-900" },
  emerald: { text: "text-emerald-700", bg: "bg-emerald-700 hover:bg-emerald-800", chip: "bg-emerald-100 text-emerald-900" },
  rose:    { text: "text-rose-700",    bg: "bg-rose-700 hover:bg-rose-800",       chip: "bg-rose-100 text-rose-900" },
  sky:     { text: "text-sky-700",     bg: "bg-sky-700 hover:bg-sky-800",         chip: "bg-sky-100 text-sky-900" },
  stone:   { text: "text-stone-700",   bg: "bg-stone-800 hover:bg-stone-900",     chip: "bg-stone-200 text-stone-800" },
};

export const FONTS: Record<string, { display: string; label: string }> = {
  serif:   { display: "font-display", label: "Classic serif" },
  sans:    { display: "font-sans font-bold tracking-tight", label: "Modern sans" },
  strong:  { display: "font-sans font-extrabold tracking-tighter uppercase", label: "Strong caps" },
};

export const TEMPLATES = ["elegant", "bold", "professional", "minimal"] as const;

export function theme(template: string, accent?: string, font?: string) {
  const base = {
    elegant: {
      page: "bg-[#faf7f2] text-stone-900",
      header: "bg-[#faf7f2]/90 border-b border-stone-200",
      hero: "bg-[#f4efe7]",
      card: "bg-white border border-stone-200",
      display: "font-display",
      sectionAlt: "bg-white",
      footer: "bg-[#f4efe7] text-stone-500",
      defaultAccent: "amber",
    },
    bold: {
      page: "bg-white text-stone-900",
      header: "bg-stone-950/95 border-b border-stone-800 text-white",
      hero: "bg-stone-950 text-white",
      card: "bg-white border border-stone-200 shadow-sm",
      display: "font-sans font-extrabold tracking-tight",
      sectionAlt: "bg-stone-50",
      footer: "bg-stone-950 text-stone-400",
      defaultAccent: "violet",
    },
    professional: {
      page: "bg-slate-50 text-slate-900",
      header: "bg-white/95 border-b border-slate-200",
      hero: "bg-white",
      card: "bg-white border border-slate-200 shadow-sm",
      display: "font-sans font-bold tracking-tight",
      sectionAlt: "bg-white",
      footer: "bg-slate-900 text-slate-400",
      defaultAccent: "blue",
    },
    minimal: {
      page: "bg-white text-neutral-900",
      header: "bg-white/90 border-b border-neutral-100",
      hero: "bg-white",
      card: "bg-white border border-neutral-200",
      display: "font-sans font-medium tracking-tight",
      sectionAlt: "bg-neutral-50",
      footer: "bg-white border-t border-neutral-100 text-neutral-400",
      defaultAccent: "stone",
    },
  }[template as "elegant"] || undefined;
  const b = base || {
    page: "bg-[#faf7f2] text-stone-900", header: "bg-[#faf7f2]/90 border-b border-stone-200",
    hero: "bg-[#f4efe7]", card: "bg-white border border-stone-200", display: "font-display",
    sectionAlt: "bg-white", footer: "bg-[#f4efe7] text-stone-500", defaultAccent: "amber",
  };
  const a = ACCENTS[accent || b.defaultAccent] || ACCENTS[b.defaultAccent];
  const display = font && FONTS[font] ? FONTS[font].display : b.display;
  return { ...b, display, accentText: a.text, accentBg: a.bg, chip: a.chip };
}

export function waLink(biz: Biz): string {
  const wa = (biz.whatsapp || biz.phone || "").replace(/\D/g, "");
  if (!wa) return "";
  return `https://wa.me/${wa.length === 10 ? "91" + wa : wa}`;
}

export function discounted(priceText: string, discountPct: number): { original: string; final: string | null } {
  if (!discountPct || discountPct <= 0) return { original: priceText, final: null };
  const digits = priceText.replace(/[^0-9.]/g, "");
  const n = parseFloat(digits);
  if (!isFinite(n) || n <= 0) return { original: priceText, final: null };
  const final = Math.round(n * (1 - discountPct / 100));
  const currency = priceText.trim().startsWith("₹") || !/[A-Za-z$€£]/.test(priceText) ? "₹" : priceText.trim()[0];
  return { original: priceText, final: `${currency}${final.toLocaleString("en-IN")}` };
}

/** Header items for the tenant site nav, given resolved tabs + product count. */
export function navItems(slug: string, content: Content, productCount: number) {
  const base = `/s/${slug}`;
  const items: { href: string; label: string; key: string }[] = [{ href: base, label: "Home", key: "home" }];
  for (const t of enabledTabs(content)) {
    if (t.key === "about") continue; // rendered as a home section
    if (t.key === "products") { if (productCount) items.push({ href: `${base}/products`, label: t.label, key: t.key }); continue; }
    if (t.key === "gallery") { if (productCount) items.push({ href: `${base}/gallery`, label: t.label, key: t.key }); continue; }
    if (t.key === "contact") { items.push({ href: `${base}#contact`, label: t.label, key: t.key }); continue; }
    items.push({ href: `${base}/t/${t.key}`, label: t.label, key: t.key }); // text tabs (pricing/terms/faq/custom)
  }
  return items;
}

export async function loadTenant(slug: string) {
  const biz = await q<Biz>(`select * from jhalak.businesses where slug=$1`, [slug]);
  if (!biz.length) return null;
  const [content, products] = await Promise.all([
    q<{ content: Content }>(`select content from jhalak.site_content where business_id=$1`, [biz[0].id]),
    q<Product>(
      `select * from jhalak.products where business_id=$1 and visible=true and status='ready' order by sort, created_at`,
      [biz[0].id]
    ),
  ]);
  return { biz: biz[0], content: content[0]?.content || {}, products };
}
