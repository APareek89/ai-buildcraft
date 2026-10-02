import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import LeadForm from "./LeadForm";
import TenantHeader from "./TenantHeader";
import Sections from "./Sections";
import ProductThumb from "./ProductThumb";
import EditBridge from "./EditBridge";
import { loadTenant, theme, waLink, enabledTabs, enabledSections, navItems, discounted } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadTenant(slug);
  if (!data) return {};
  return {
    title: `${data.biz.name}${data.biz.city ? " · " + data.biz.city : ""}`,
    description: data.content.tagline || data.content.about || "",
  };
}

export default async function Site({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { slug } = await params;
  const editMode = (await searchParams)?.edit === "1";
  const data = await loadTenant(slug);
  if (!data) notFound();
  const { biz, content, products } = data;
  const t = theme(biz.template, content.accent, content.font);
  const on = new Set(enabledTabs(content).map((x) => x.key));
  const tabs = {
    products: on.has("products"), about: on.has("about"),
    gallery: on.has("gallery"), contact: on.has("contact"),
  };
  const wa = waLink(biz);
  // Prefer a dedicated (generated/uploaded) hero; fall back to the first product photo.
  const heroImg = content.hero_image_url || products[0]?.processed_url || products[0]?.original_url || "";
  const isService = biz.category !== "boutique";
  const featured = products.slice(0, 3);
  const sections = enabledSections(content);
  const statsSections = sections.filter((s) => s.type === "stats");
  const trustSections = sections.filter((s) => s.type !== "stats");
  const contactHref = on.has("contact") ? "#contact" : wa || "#";
  // eyebrow: city · (real category, or the business_type for generic "other")
  const kind = biz.category && biz.category !== "other" ? biz.category : content.business_type || "";
  const eyebrow = [biz.city, kind].filter(Boolean).join(" · ");

  return (
    <div className={`min-h-screen ${t.page}`}>
      {editMode && <EditBridge />}
      {biz.status !== "published" && !editMode && (
        <div className="bg-amber-100 text-amber-900 text-center text-xs py-1.5">
          Draft preview — not published yet
        </div>
      )}

      <TenantHeader
        slug={slug} name={biz.name} logo={biz.logo_url} displayClass={t.display}
        headerClass={t.header} accentBg={t.accentBg} wa={wa}
        items={navItems(slug, content, products.length)}
      />

      <section data-section="hero" className={`${t.hero}`}>
        <div className="max-w-5xl mx-auto px-6 py-16 sm:py-24 grid sm:grid-cols-2 gap-10 items-center">
          <div>
            {eyebrow && (
              <p className={`text-xs uppercase tracking-[0.25em] mb-4 ${t.accentText}`}>{eyebrow}</p>
            )}
            <h1 data-sel="headline" data-sel-label="Headline" data-edit="headline" className={`${t.display} text-4xl sm:text-5xl leading-tight`}>
              {content.headline || biz.name}
            </h1>
            {content.tagline && <p data-sel="tagline" data-sel-label="Tagline" data-edit="tagline" className="mt-4 text-lg opacity-80">{content.tagline}</p>}
            <div className="mt-8 flex gap-3">
              <a href={contactHref} data-sel="cta" data-sel-label="Button" data-edit="cta_label" className={`rounded-full ${t.accentBg} text-white px-7 py-3.5 font-semibold transition`}>
                {content.cta_label || "Get in touch"}
              </a>
              {biz.phone && (
                <a href={`tel:${biz.phone}`} className="rounded-full border border-current/30 px-7 py-3.5 font-semibold opacity-80 hover:opacity-100 transition">
                  Call
                </a>
              )}
            </div>
          </div>
          {heroImg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroImg} data-sel="hero-image" data-sel-label="Hero image" alt={biz.name} className="rounded-3xl aspect-square object-cover w-full shadow-2xl" />
          )}
        </div>
      </section>

      {/* stats strip sits right under the hero */}
      <Sections sections={statsSections} t={t} wa={wa} contactHref={contactHref} />

      {tabs.about && content.about && (
        <section className="max-w-5xl mx-auto px-6 py-16">
          <h2 className={`${t.display} text-2xl mb-4`}>About us</h2>
          <p data-sel="about" data-sel-label="About text" data-edit="about" className="max-w-2xl text-lg leading-8 opacity-80">{content.about}</p>
        </section>
      )}

      {!!content.services?.length && (
        <section className={t.sectionAlt}>
          <div className="max-w-5xl mx-auto px-6 py-16">
            <h2 className={`${t.display} text-2xl mb-8`}>What we do</h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {content.services.map((s, i) => (
                <div key={i} data-sel={`service:${i}`} data-sel-label={`Service ${i + 1}`} className={`rounded-2xl p-6 ${t.card}`}>
                  <h3 data-edit={`service:${i}:title`} className="font-semibold mb-2">{s.title}</h3>
                  <p data-edit={`service:${i}:desc`} className="text-sm opacity-70 leading-6">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tabs.products && !!featured.length && (
        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className={`${t.display} text-2xl`}>{isService ? "Our work" : "Featured"}</h2>
            <Link href={`/s/${slug}/products`} className={`text-sm font-semibold ${t.accentText}`}>
              View all products →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {featured.map((p) => {
              const price = discounted(p.price_text, p.discount_pct);
              return (
                <Link key={p.id} href={`/s/${slug}/products`} data-sel={`product:${p.id}`} data-sel-label={`${p.title || "Product"}`} className={`rounded-2xl overflow-hidden ${t.card} group`}>
                  <div className="relative">
                    <ProductThumb src={p.processed_url || p.original_url} title={p.title}
                      className="aspect-square w-full group-hover:scale-[1.02] transition" />
                    {p.discount_pct > 0 && p.price_text && (
                      <span className="absolute top-3 left-3 rounded-full bg-rose-600 text-white text-xs font-bold px-2.5 py-1">
                        {p.discount_pct}% OFF
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-sm truncate">{p.title}</h3>
                    {p.price_text && (
                      <p className="text-sm mt-0.5">
                        {price.final ? (
                          <>
                            <span className={`font-semibold ${t.accentText}`}>{price.final}</span>{" "}
                            <span className="line-through opacity-50 text-xs">{price.original}</span>
                          </>
                        ) : (
                          <span className={`font-semibold ${t.accentText}`}>{p.price_text}</span>
                        )}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* trust-building blocks: industries, testimonials, certifications, CTA banner */}
      <Sections sections={trustSections} t={t} wa={wa} contactHref={contactHref} />

      {tabs.contact && (
        <section id="contact" className={t.sectionAlt}>
          <div className="max-w-5xl mx-auto px-6 py-16 grid sm:grid-cols-2 gap-10">
            <div>
              <h2 className={`${t.display} text-2xl mb-4`}>Visit or message us</h2>
              <p className="opacity-70 mb-6">
                {biz.city && <>📍 {biz.city}<br /></>}
                {biz.phone && <>📞 {biz.phone}</>}
              </p>
              {wa && (
                <a href={wa} className={`inline-block rounded-full ${t.accentBg} text-white px-6 py-3 font-semibold transition`}>
                  Chat on WhatsApp
                </a>
              )}
            </div>
            <LeadForm slug={biz.slug} accentBg={t.accentBg} />
          </div>
        </section>
      )}

      <footer className={`${t.footer} text-center text-xs py-6`}>
        {biz.name} · Made with Jhalak
      </footer>

      {wa && (
        <a href={wa} aria-label="WhatsApp"
          className="fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-[#25D366] shadow-xl flex items-center justify-center text-2xl hover:scale-105 transition">
          💬
        </a>
      )}
    </div>
  );
}
