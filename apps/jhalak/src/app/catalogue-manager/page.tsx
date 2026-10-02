import type { Metadata } from "next";
import { EngineShell, EngineHero, StepStrip, FeatureGrid, DemoStrip } from "@/components/EnginePage";

export const metadata: Metadata = {
  title: "Catalogue Manager — Jhalak",
  description: "Phone photos in, a professional catalogue out — titles and descriptions written by AI.",
};

export default function CatalogueManagerPage() {
  return (
    <EngineShell>
      <EngineHero
        kicker="Engine 2 · Catalogue Manager"
        title="Phone photos in. A professional catalogue out."
        lede="No photographer, no typing. Upload photos of your products or your space, and AI writes the titles, descriptions and tags — your website fills itself."
        ctaLabel="Build my catalogue"
      />
      <StepStrip
        steps={[
          { n: "1", t: "Upload from your phone", d: "Products, your space, your work — straight from your camera roll. Photos are automatically optimised for fast loading." },
          { n: "2", t: "AI writes every item", d: "Claude looks at each photo and writes a proper title, an appealing description, and tags — in your chosen language. Edit anything inline." },
          { n: "3", t: "Everything stays in sync", d: "Your catalogue powers your website instantly. Add, hide, price, or delete items from one dashboard." },
        ]}
      />
      <FeatureGrid
        items={[
          { icon: "🖼️", t: "Studio-grade polish", d: "AI photo enhancement turns casual phone shots into clean catalogue images — switching on in this preview soon." },
          { icon: "🏷️", t: "Prices your way", d: "Show a price, a range, or nothing at all — many businesses prefer 'Enquire for price'. Your call, per item." },
          { icon: "💬", t: "Enquire per item", d: "Every catalogue item gets its own 'Enquire on WhatsApp' button with the item name pre-filled." },
        ]}
      />
      <DemoStrip />
    </EngineShell>
  );
}
