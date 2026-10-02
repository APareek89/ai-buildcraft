import type { Metadata } from "next";
import { EngineShell, EngineHero, StepStrip, FeatureGrid, DemoStrip } from "@/components/EnginePage";

export const metadata: Metadata = {
  title: "Website — Jhalak",
  description: "A premium website for your business in 5 minutes. AI-written copy, WhatsApp enquiries, no designer needed.",
};

export default function WebsitePage() {
  return (
    <EngineShell>
      <EngineHero
        kicker="Engine 1 · Website"
        title="A website that makes your business look as good as it is."
        lede="Your customers already trust you. Your website's job is to show new ones that you're modern, premium, and serious — and bring their enquiries straight to WhatsApp."
        ctaLabel="Create my website"
      />
      <StepStrip
        steps={[
          { n: "1", t: "Pick a style", d: "Elegant (boutiques, salons, designers) or Bold (gyms, clinics, studios). Both look premium on every phone." },
          { n: "2", t: "Answer 3 questions", d: "What you offer, what makes you special, what customers should do. AI writes your whole website — in English or Hinglish. You can edit every line." },
          { n: "3", t: "Publish & share", d: "Your site goes live at your own link with a QR code — share it on WhatsApp Status, print it, put it on your board." },
        ]}
      />
      <FeatureGrid
        items={[
          { icon: "💬", t: "WhatsApp-first", d: "Every button routes to your WhatsApp — enquiries land where you already talk to customers. No cart, no checkout complexity." },
          { icon: "📥", t: "Leads inbox", d: "Every enquiry is saved in your dashboard with a one-tap 'Reply on WhatsApp' — nothing gets lost." },
          { icon: "✍️", t: "Edit anytime", d: "Change your copy, switch templates, add items — from a simple dashboard, no designer needed." },
        ]}
      />
      <DemoStrip />
    </EngineShell>
  );
}
