import { ChevronDown } from "lucide-react";
import { FAQS } from "@/components/landing/landing-data";

/**
 * FAQ rendered with native <details>/<summary> — every answer is present in the
 * server-rendered HTML (crawlable by search engines and LLMs), collapsed via
 * the browser's built-in disclosure behavior, no JavaScript required.
 * The visible text is the same FAQS array used for the FAQPage JSON-LD.
 */
export function FaqSection() {
  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-6 py-24">
      <h2 className="text-balance text-center text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
        {"AI visibility, GEO, and AI citation tracking — your questions, answered straight"}
      </h2>
      <p className="mt-5 text-center text-muted-foreground">
        {
          "These answers are written to be quoted — by you, by your boss, or by an AI assistant. They ship as FAQPage structured data, exactly as you read them here."
        }
      </p>
      <div className="mt-10">
        {FAQS.map((f, i) => (
          <details key={f.q} className="glass group mb-3 rounded-[20px]" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left font-medium text-foreground [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
            </summary>
            <p className="p-5 pt-0 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
