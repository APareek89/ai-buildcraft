"use client";

import Link from "next/link";
import { LogOut, ChevronDown, Plus, Globe } from "lucide-react";
import { useState } from "react";
import { fetchJson } from "@/lib/client";
import { useRouter } from "next/navigation";

export type ShellItem = {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: number;
};

export type PortfolioSite = { id: string; name: string; slug: string; status: string };

export default function AppShell({
  items, breadcrumb, actions, userName, children, portfolio,
}: {
  items: ShellItem[];
  breadcrumb: React.ReactNode;
  actions?: React.ReactNode;
  userName?: string;
  children: React.ReactNode;
  portfolio?: { currentId?: string; sites: PortfolioSite[] };
}) {
  const [portOpen, setPortOpen] = useState(false);
  const currentSite = portfolio?.sites.find((b) => b.id === portfolio.currentId);
  const router = useRouter();
  const logout = async () => {
    await fetchJson("/api/auth/me", { method: "DELETE" });
    router.push("/");
  };

  const Item = ({ it }: { it: ShellItem }) => {
    const Icon = it.icon;
    const cls = `flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-[13px] transition cursor-pointer ${
      it.active ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/40"
      : it.disabled ? "text-slate-600 cursor-not-allowed"
      : "text-slate-400 hover:text-white hover:bg-slate-800"
    }`;
    const inner = (
      <>
        <Icon size={15} />
        <span className="flex-1 truncate">{it.label}</span>
        {!!it.badge && <span className="text-[10px] bg-blue-500 text-white rounded-full px-1.5 py-0.5">{it.badge}</span>}
      </>
    );
    if (it.href && !it.disabled) return <Link href={it.href} className={cls}>{inner}</Link>;
    return <button onClick={it.disabled ? undefined : it.onClick} className={cls}>{inner}</button>;
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* sidebar */}
      <aside className="hidden lg:flex w-[210px] shrink-0 bg-slate-950 flex-col p-3 sticky top-0 h-screen">
        <Link href="/" className="font-display text-white text-lg font-bold px-3 pt-1 pb-4 block">Jhalak</Link>
        {portfolio && (
          <div className="relative mb-3">
            <button onClick={() => setPortOpen(!portOpen)}
              className="w-full flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-left cursor-pointer hover:border-slate-600 transition">
              <Globe size={13} className="text-blue-400 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wide">My Portfolio</span>
                <span className="block text-xs text-white font-medium truncate">{currentSite?.name || "My websites"}</span>
              </span>
              <ChevronDown size={13} className={`text-slate-500 transition ${portOpen ? "rotate-180" : ""}`} />
            </button>
            {portOpen && (
              <>
              <div className="fixed inset-0 z-20" onClick={() => setPortOpen(false)} />
              <div className="absolute z-30 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-xl">
                {portfolio.sites.map((b) => (
                  <Link key={b.id} href={`/admin/${b.id}`} onClick={() => setPortOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800 transition ${
                      b.id === portfolio.currentId ? "text-white font-semibold" : "text-slate-300"
                    }`}>
                    <span className="truncate">{b.name}</span>
                    <span className={`ml-2 w-1.5 h-1.5 rounded-full shrink-0 ${b.status === "published" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  </Link>
                ))}
                <Link href="/start" onClick={() => setPortOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-blue-400 font-semibold border-t border-slate-800 hover:bg-slate-800 transition">
                  <Plus size={12} /> New website
                </Link>
              </div>
              </>
            )}
          </div>
        )}
        <nav className="flex flex-col gap-1">
          {items.map((it) => <Item key={it.label} it={it} />)}
        </nav>
        <div className="flex-1" />
        <div className="border-t border-slate-800 pt-3 px-1 flex items-center justify-between">
          <span className="text-xs text-slate-400 truncate">{userName || "Guest"}</span>
          {userName && (
            <button onClick={logout} title="Log out"
              className="text-slate-500 hover:text-white transition cursor-pointer"><LogOut size={14} /></button>
          )}
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-2 min-w-0 text-sm text-slate-500">
            <Link href="/" className="lg:hidden font-display font-bold text-slate-900 mr-1">Jhalak</Link>
            <div className="truncate">{breadcrumb}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <div className="w-7 h-7 rounded-full bg-indigo-200 text-indigo-800 text-xs font-bold flex items-center justify-center">
              {(userName || "?").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        {/* mobile nav strip */}
        <nav className="lg:hidden flex gap-1 overflow-x-auto px-3 py-2 bg-slate-950">
          {items.map((it) => {
            const Icon = it.icon;
            const cls = `shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition ${
              it.active ? "bg-blue-600 text-white font-semibold" : it.disabled ? "text-slate-600" : "text-slate-300"
            }`;
            if (it.href && !it.disabled) return <Link key={it.label} href={it.href} className={cls}><Icon size={12} />{it.label}</Link>;
            return <button key={it.label} onClick={it.disabled ? undefined : it.onClick} className={cls}><Icon size={12} />{it.label}</button>;
          })}
        </nav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
