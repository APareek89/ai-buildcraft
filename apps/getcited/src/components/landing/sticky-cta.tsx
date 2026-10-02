"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * State-aware sticky CTA. Mounts a fixed pill (desktop) / bottom bar (mobile)
 * whenever neither the hero audit form (#audit-form) nor the closing CTA band
 * (#final-cta) is in view. Clicking scrolls back to the audit form.
 */
export function StickyCta() {
  const [visible, setVisible] = useState(false);
  const label = "Run my free audit";

  useEffect(() => {
    const form = document.getElementById("audit-form");
    const finalCta = document.getElementById("final-cta");
    if (!form) return;

    const inView = new Map<Element, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView.set(entry.target, entry.isIntersecting);
        const anyInView = [...inView.values()].some(Boolean);
        setVisible(!anyInView);
      },
      { threshold: 0.1 },
    );
    observer.observe(form);
    if (finalCta) observer.observe(finalCta);
    return () => observer.disconnect();
  }, []);

  function scrollToForm() {
    document.getElementById("audit-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!visible) return null;

  return (
    <>
      {/* Desktop pill */}
      <button
        type="button"
        onClick={scrollToForm}
        className="glass fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-foreground shadow-2xl shadow-violet-500/20 transition-colors hover:bg-secondary sm:inline-flex"
      >
        {label} <ArrowUp className="h-4 w-4 text-aurora" />
      </button>
      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <button
          type="button"
          onClick={scrollToForm}
          className="bg-aurora w-full rounded-full py-3 text-sm font-medium text-white shadow-2xl shadow-violet-500/30"
        >
          {label}
        </button>
      </div>
    </>
  );
}
