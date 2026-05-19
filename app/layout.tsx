import type { Metadata, Viewport } from "next";
import { Geist_Mono, Sora } from "next/font/google";

import "./globals.css";

// Sora — Habitat One huisstijl-font. Globaal als --font-sans (zie globals.css).
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Geist Mono blijft voor monospace (code/refs/SKUs in tabellen).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Habitat CRM",
    template: "%s · Habitat CRM",
  },
  description:
    "CRM voor Habitat One — contacten & leads, deals, panden, offertes & facturen.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="nl"
      className={`${sora.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
