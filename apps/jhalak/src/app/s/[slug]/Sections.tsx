import type { Section } from "@/lib/tenant";
import { theme } from "@/lib/tenant";

type Theme = ReturnType<typeof theme>;

/**
 * Renders the ordered, typed rich-section blocks (content.sections[]) below the
 * hero. Server component — no client JS. Each block carries a `data-section`
 * marker so the Studio edit bridge (?edit=1) can select it for section-scoped chat.
 */
export default function Sections({
  sections,
  t,
  wa,
  contactHref,
}: {
  sections: Section[];
  t: Theme;
  wa: string;
  contactHref: string;
}) {
  if (!sections.length) return null;
  return (
    <>
      {sections.map((s) => {
        const label = ({ stats: "Stats strip", industries: "Industries", testimonials: "Testimonials", certifications: "Certifications", cta_banner: "CTA banner" } as Record<string, string>)[s.type] || s.type;
        const marker = { "data-sel": `section:${s.id}`, "data-sel-label": label } as Record<string, unknown>;

        if (s.type === "stats") {
          // static classes only — Tailwind JIT can't see runtime-built class strings
          const cols = s.items.length >= 4 ? "sm:grid-cols-4" : s.items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
          return (
            <section key={s.id} {...marker} className={t.sectionAlt}>
              <div className="max-w-5xl mx-auto px-6 py-12">
                <div className={`grid grid-cols-2 ${cols} gap-6`}>
                  {s.items.map((it, j) => (
                    <div key={j} className="text-center">
                      <div className={`${t.display} text-3xl sm:text-4xl ${t.accentText}`}>{it.value}</div>
                      <div className="mt-1 text-sm opacity-70">{it.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        }

        if (s.type === "industries") {
          return (
            <section key={s.id} {...marker} className="max-w-5xl mx-auto px-6 py-16">
              <h2 className={`${t.display} text-2xl mb-8`}>{s.title || "Industries we serve"}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {s.items.map((it, j) => (
                  <div key={j} className={`rounded-2xl overflow-hidden ${t.card}`}>
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.name} className="aspect-[4/3] object-cover w-full" />
                    ) : (
                      <div className={`aspect-[4/3] ${t.hero} flex items-center justify-center`}>
                        <span className={`text-sm font-semibold ${t.accentText} px-3 text-center`}>{it.name}</span>
                      </div>
                    )}
                    {it.image_url && <div className="p-3 text-sm font-medium text-center">{it.name}</div>}
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (s.type === "testimonials") {
          return (
            <section key={s.id} {...marker} className={t.sectionAlt}>
              <div className="max-w-5xl mx-auto px-6 py-16">
                <h2 className={`${t.display} text-2xl mb-8`}>{s.title || "What our clients say"}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {s.items.map((it, j) => (
                    <figure key={j} className={`rounded-2xl p-6 ${t.card}`}>
                      <blockquote className="text-sm leading-7 opacity-80">“{it.quote}”</blockquote>
                      <figcaption className="mt-4 text-sm font-semibold">
                        {it.author}
                        {it.role && <span className="block font-normal opacity-60">{it.role}</span>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </section>
          );
        }

        if (s.type === "certifications") {
          return (
            <section key={s.id} {...marker} className="max-w-5xl mx-auto px-6 py-14">
              <h2 className={`${t.display} text-2xl mb-8`}>{s.title || "Certifications & standards"}</h2>
              <div className="flex flex-wrap gap-3">
                {s.items.map((it, j) => (
                  <div key={j} className={`flex items-center gap-2.5 rounded-full ${t.card} px-4 py-2.5`}>
                    {it.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.name} className="w-6 h-6 object-contain rounded" />
                    )}
                    <span className="text-sm font-medium">{it.name}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (s.type === "cta_banner") {
          const href = wa || contactHref;
          return (
            <section key={s.id} {...marker} className={`${t.accentBg} text-white`}>
              <div className="max-w-5xl mx-auto px-6 py-14 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
                <div>
                  <h2 className={`${t.display} text-2xl sm:text-3xl`}>{s.heading}</h2>
                  {s.subtext && <p className="mt-2 opacity-90 max-w-xl">{s.subtext}</p>}
                </div>
                {href && (
                  <a href={href} className="shrink-0 rounded-full bg-white/95 text-stone-900 px-7 py-3.5 font-semibold hover:bg-white transition">
                    {s.button_label || "Get in touch"}
                  </a>
                )}
              </div>
            </section>
          );
        }

        return null;
      })}
    </>
  );
}
