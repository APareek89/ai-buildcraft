"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TenantHeader({
  slug, name, logo, displayClass, headerClass, accentBg, wa, items,
}: {
  slug: string; name: string; logo?: string; displayClass: string; headerClass: string;
  accentBg: string; wa: string;
  items: { href: string; label: string; key: string }[];
}) {
  const path = usePathname();
  const base = `/s/${slug}`;
  return (
    <header className={`sticky top-0 z-20 backdrop-blur ${headerClass}`}>
      <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between gap-3">
        <Link href={base} className={`${displayClass} text-xl shrink-0 flex items-center gap-2.5`}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-9 w-9 rounded-lg object-contain bg-white/60" />
          )}
          {name}
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          {items.map((i) => {
            const active = path === i.href;
            return (
              <Link
                key={i.href + i.label}
                href={i.href}
                data-sel={`tab:${i.key}`}
                data-sel-label={`${i.label} tab`}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm transition ${
                  active ? "font-semibold underline underline-offset-8" : "opacity-75 hover:opacity-100"
                }`}
              >
                {i.label}
              </Link>
            );
          })}
        </div>
        {wa && (
          <a href={wa} className={`shrink-0 rounded-full ${accentBg} text-white px-4 py-2 text-sm font-medium transition hidden sm:block`}>
            WhatsApp us
          </a>
        )}
      </div>
    </header>
  );
}
