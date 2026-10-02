import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TenantHeader from "../../TenantHeader";
import { loadTenant, theme, waLink, tabsConfig, navItems } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; key: string }> }
): Promise<Metadata> {
  const { slug, key } = await params;
  const data = await loadTenant(slug);
  if (!data) return {};
  const tab = tabsConfig(data.content).find((t) => t.key === key);
  return { title: `${tab?.label || key} · ${data.biz.name}` };
}

export default async function TextTabPage(
  { params }: { params: Promise<{ slug: string; key: string }> }
) {
  const { slug, key } = await params;
  const data = await loadTenant(slug);
  if (!data) notFound();
  const { biz, content, products } = data;
  const tab = tabsConfig(content).find((t) => t.key === key && t.enabled && t.text);
  if (!tab) notFound();
  const t = theme(biz.template, content.accent, content.font);
  const body = (content.pages || {})[key] || "";

  return (
    <div className={`min-h-screen ${t.page}`}>
      <TenantHeader
        slug={slug} name={biz.name} logo={biz.logo_url} displayClass={t.display}
        headerClass={t.header} accentBg={t.accentBg} wa={waLink(biz)}
        items={navItems(slug, content, products.length)}
      />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className={`${t.display} text-3xl mb-8`}>{tab.label}</h1>
        {body ? (
          <div className="space-y-4 leading-8 opacity-85">
            {body.split(/\n\n+/).map((para, i) => (
              <p key={i} className="whitespace-pre-line">{para}</p>
            ))}
          </div>
        ) : (
          <p className="opacity-50">This page has no content yet.</p>
        )}
      </main>
      <footer className={`${t.footer} text-center text-xs py-6`}>
        {biz.name} · Made with Jhalak
      </footer>
    </div>
  );
}
