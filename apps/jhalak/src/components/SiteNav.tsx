"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/website", label: "Website" },
  { href: "/catalogue-manager", label: "Catalogue Manager" },
  { href: "/social-media", label: "Social Media Marketing" },
];

export default function SiteNav() {
  const path = usePathname();
  const [me, setMe] = useState<{ user: { name: string } | null; businesses?: { id: string }[] } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(setMe).catch(() => {});
  }, []);
  return (
    <header className="sticky top-0 z-30 bg-[#faf9f7]/90 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="font-display text-2xl font-semibold tracking-tight shrink-0">
          Jhalak
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {TABS.map((t) => {
            const active = path === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <span className="flex items-center gap-2 shrink-0">
          {me?.user ? (
            me.businesses?.length ? (
              <Link href={`/admin/${me.businesses[0].id}`}
                className="hidden sm:block text-sm font-medium text-slate-600 hover:text-blue-600 transition">
                My dashboard
              </Link>
            ) : null
          ) : (
            <Link href="/login" className="hidden sm:block text-sm font-medium text-slate-600 hover:text-blue-600 transition">
              Log in
            </Link>
          )}
          <Link
            href="/start"
            className="rounded-full bg-blue-600 text-white px-4 sm:px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition"
          >
            Create your website
          </Link>
        </span>
      </div>
      {/* mobile tabs */}
      <nav className="md:hidden flex overflow-x-auto gap-1 px-4 pb-3">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition ${
                active ? "bg-slate-900 text-white" : "text-slate-600 bg-slate-200/60"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
