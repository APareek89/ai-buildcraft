"use client";

import { useMemo, useState } from "react";
import ProductThumb from "../ProductThumb";

type P = {
  id: string; title: string; description: string; category: string;
  price_text: string; discount_pct: number; image: string;
};

function priceParts(priceText: string, discountPct: number) {
  if (!discountPct || discountPct <= 0) return { original: priceText, final: null as string | null };
  const n = parseFloat(priceText.replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) return { original: priceText, final: null };
  return { original: priceText, final: `₹${Math.round(n * (1 - discountPct / 100)).toLocaleString("en-IN")}` };
}

export default function ProductsBrowser({
  products, accentText, accentBg, chip, card, wa,
}: {
  products: P[]; accentText: string; accentBg: string; chip: string; card: string; wa: string;
}) {
  const categories = useMemo(() => {
    const set = new Map<string, number>();
    products.forEach((p) => {
      const c = p.category?.trim() || "Other";
      set.set(c, (set.get(c) || 0) + 1);
    });
    return Array.from(set.entries());
  }, [products]);

  const [active, setActive] = useState<string>("All");
  const [open, setOpen] = useState<P | null>(null);

  const shown = active === "All"
    ? products
    : products.filter((p) => (p.category?.trim() || "Other") === active);

  return (
    <>
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-8">
          {[["All", products.length] as [string, number], ...categories].map(([c, n]) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
                active === c ? `${accentBg} text-white` : chip
              }`}
            >
              {c} <span className="opacity-60">({n})</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {shown.map((p) => {
          const price = priceParts(p.price_text, p.discount_pct);
          return (
            <button key={p.id} onClick={() => setOpen(p)}
              className={`text-left rounded-2xl overflow-hidden ${card} group cursor-pointer`}>
              <div className="relative">
                <ProductThumb src={p.image} title={p.title}
                  className="aspect-square w-full group-hover:scale-[1.02] transition" />
                {p.discount_pct > 0 && p.price_text && (
                  <span className="absolute top-3 left-3 rounded-full bg-rose-600 text-white text-xs font-bold px-2.5 py-1">
                    {p.discount_pct}% OFF
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-medium text-sm truncate">{p.title || "Untitled"}</h3>
                {p.price_text ? (
                  <p className="text-sm mt-0.5">
                    {price.final ? (
                      <>
                        <span className={`font-semibold ${accentText}`}>{price.final}</span>{" "}
                        <span className="line-through opacity-50 text-xs">{price.original}</span>
                      </>
                    ) : (
                      <span className={`font-semibold ${accentText}`}>{p.price_text}</span>
                    )}
                  </p>
                ) : (
                  <p className={`text-xs mt-0.5 font-medium ${accentText}`}>Enquire for price</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {!shown.length && <p className="text-center opacity-50 py-16">No items in this category yet.</p>}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={() => setOpen(null)}>
          <div className="bg-white text-stone-900 rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <ProductThumb src={open.image} title={open.title} className="w-full aspect-square sm:aspect-video" />
            <div className="p-6 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  {open.category && (
                    <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full mb-2 ${chip}`}>
                      {open.category}
                    </span>
                  )}
                  <h2 className="text-xl font-semibold">{open.title}</h2>
                </div>
                <button onClick={() => setOpen(null)} className="text-stone-400 hover:text-stone-700 text-2xl leading-none">×</button>
              </div>
              {(() => {
                const price = priceParts(open.price_text, open.discount_pct);
                return open.price_text ? (
                  <p className="text-lg">
                    {price.final ? (
                      <>
                        <span className={`font-bold ${accentText}`}>{price.final}</span>{" "}
                        <span className="line-through opacity-50 text-sm">{price.original}</span>{" "}
                        <span className="rounded-full bg-rose-600 text-white text-xs font-bold px-2 py-0.5 ml-1">
                          {open.discount_pct}% OFF
                        </span>
                      </>
                    ) : (
                      <span className={`font-bold ${accentText}`}>{open.price_text}</span>
                    )}
                  </p>
                ) : (
                  <p className={`font-medium ${accentText}`}>Enquire for price</p>
                );
              })()}
              {open.description && <p className="opacity-75 leading-7">{open.description}</p>}
              {wa && (
                <a href={`${wa}?text=${encodeURIComponent(`Hi! I'm interested in ${open.title}`)}`}
                  className={`inline-block rounded-full ${accentBg} text-white px-6 py-3 font-semibold transition`}>
                  Enquire on WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
