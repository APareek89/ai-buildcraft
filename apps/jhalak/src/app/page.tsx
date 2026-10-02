import Link from "next/link";
import { EngineShell, DemoStrip } from "@/components/EnginePage";

const STEPS = [
  { n: "1", t: "Tell us about your business", d: "Name, city, and three simple questions. Hindi-English bhi chalega." },
  { n: "2", t: "Upload photos from your phone", d: "AI writes your catalogue — titles, descriptions, everything." },
  { n: "3", t: "Your website is live", d: "Premium website + WhatsApp enquiries + Instagram reels, ready in minutes." },
];

const ENGINES = [
  {
    t: "Website",
    href: "/website",
    d: "Elegant templates, copy written for your business by AI — your statement that you are modern and serious. Enquiries come to WhatsApp.",
    icon: "🏛️",
  },
  {
    t: "Catalogue Manager",
    href: "/catalogue-manager",
    d: "Phone photos go in — a clean catalogue comes out, with titles and descriptions written automatically. One catalogue feeds everything.",
    icon: "✨",
  },
  {
    t: "Social Media Marketing",
    href: "/social-media",
    d: "Pick any item from your catalogue and get Instagram-ready reels generated for you. Download and post.",
    icon: "🎬",
  },
];

export default function Home() {
  return (
    <EngineShell>
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-blue-600 mb-6">
          For Indian small businesses
        </p>
        <h1 className="font-display text-5xl sm:text-6xl font-semibold leading-[1.1] tracking-tight max-w-3xl mx-auto">
          Your business, beautifully online — in 5 minutes.
        </h1>
        <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">
          A premium website, a professional catalogue from your phone photos, and
          Instagram reels — made by AI, owned by you. No designer. No photographer.
          No agency.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/start"
            className="rounded-full bg-blue-600 text-white px-8 py-4 text-base font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20"
          >
            Start free — 5 minute mein
          </Link>
        </div>
        <p className="mt-4 text-sm text-slate-400">Create an account to save and edit your business.</p>
      </section>

      <section className="bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-16 grid sm:grid-cols-3 gap-10">
          {ENGINES.map((e) => (
            <Link key={e.t} href={e.href} className="group text-center sm:text-left">
              <div className="text-3xl mb-4">{e.icon}</div>
              <h3 className="font-display text-xl font-semibold mb-2 group-hover:text-blue-700 transition">
                {e.t} →
              </h3>
              <p className="text-slate-600 text-sm leading-6">{e.d}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-display text-3xl font-semibold text-center mb-12">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-8">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl bg-white border border-slate-200 p-6">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold mb-4">
                {s.n}
              </div>
              <h3 className="font-semibold mb-1.5">{s.t}</h3>
              <p className="text-sm text-slate-600 leading-6">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <DemoStrip />
    </EngineShell>
  );
}
