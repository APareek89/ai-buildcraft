import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TenantHeader from "../TenantHeader";
import { loadTenant, theme, waLink, navItems } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadTenant(slug);
  if (!data) return {};
  return { title: `Gallery · ${data.biz.name}` };
}

export default async function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadTenant(slug);
  if (!data) notFound();
  const { biz, content, products } = data;
  const t = theme(biz.template, content.accent, content.font);
  const wa = waLink(biz);
  // a photo gallery only makes sense for items that actually have an image — imported
  // items with skipped/failed generation have no image and must NOT render a broken <img>
  const gallery = products.filter((p) => p.processed_url || p.original_url);

  return (
    <div className={`min-h-screen ${t.page}`}>
      <TenantHeader
        slug={slug} name={biz.name} logo={biz.logo_url} displayClass={t.display}
        headerClass={t.header} accentBg={t.accentBg} wa={wa}
        items={navItems(slug, content, products.length)}
      />
      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className={`${t.display} text-3xl mb-8`}>Gallery</h1>
        <div className="columns-2 sm:columns-3 gap-4 [&>img]:mb-4">
          {gallery.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.processed_url || p.original_url} alt={p.title}
              className="w-full rounded-2xl break-inside-avoid" />
          ))}
        </div>
        {!gallery.length && <p className="text-center opacity-50 py-16">No photos yet.</p>}
      </main>
      <footer className={`${t.footer} text-center text-xs py-6`}>
        {biz.name} · Made with Jhalak
      </footer>
    </div>
  );
}
