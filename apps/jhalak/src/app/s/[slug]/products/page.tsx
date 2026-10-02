import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TenantHeader from "../TenantHeader";
import ProductsBrowser from "./ProductsBrowser";
import { loadTenant, theme, waLink, navItems } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadTenant(slug);
  if (!data) return {};
  return { title: `Our Products · ${data.biz.name}` };
}

export default async function ProductsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadTenant(slug);
  if (!data) notFound();
  const { biz, content, products } = data;
  const t = theme(biz.template, content.accent, content.font);
  const wa = waLink(biz);

  return (
    <div className={`min-h-screen ${t.page}`}>
      <TenantHeader
        slug={slug} name={biz.name} logo={biz.logo_url} displayClass={t.display}
        headerClass={t.header} accentBg={t.accentBg} wa={wa}
        items={navItems(slug, content, products.length)}
      />
      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className={`${t.display} text-3xl mb-2`}>Our Products</h1>
        <p className="opacity-60 text-sm mb-8">
          {products.length} item{products.length === 1 ? "" : "s"} · tap any item for details
        </p>
        <ProductsBrowser
          products={products.map((p) => ({
            id: p.id, title: p.title, description: p.description, category: p.category,
            price_text: p.price_text, discount_pct: p.discount_pct,
            image: p.processed_url || p.original_url,
          }))}
          accentText={t.accentText} accentBg={t.accentBg} chip={t.chip} card={t.card}
          wa={wa}
        />
      </main>
      <footer className={`${t.footer} text-center text-xs py-6`}>
        {biz.name} · Made with Jhalak
      </footer>
    </div>
  );
}
