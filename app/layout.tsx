import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Leash", default: "Leash: let AI spend, keep it on a leash" },
  description:
    "A safety layer for money moved by AI agents and the people scams target. Built on the PayPal sandbox with AI review over OpenRouter.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
