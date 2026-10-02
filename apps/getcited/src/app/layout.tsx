import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountProvider } from "@/components/account/account-provider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "GetCited — Get cited by AI. Know exactly what to do.",
  description:
    "Compare model answers about your brand, inspect a modeled plan, and track execution. Prepared examples are clearly labeled; ordinary probes are directional.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="lovable-ui h-full antialiased"
      data-theme="light"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider delay={200}><AccountProvider>{children}</AccountProvider></TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
