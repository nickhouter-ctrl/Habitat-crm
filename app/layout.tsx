import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

/*
 * Fonts staan in de repo, niet bij Google. `next/font/google` haalt ze tijdens
 * élke build op; op 17-08-2026 mislukte die download en viel de CI om met een
 * stortvloed "module not found" over sora_*.module.css — een rode build zonder
 * dat er iets aan de code mankeerde. Een build die van een externe host afhangt
 * is per definitie broos, en dit zijn twee bestanden van samen 57 kB.
 *
 * Het zijn variabele fonts: één bestand dekt het hele gewichtsbereik, dus de
 * losse gewichten van voorheen (300 t/m 800) zitten er allemaal in.
 */

// Sora — Habitat One huisstijl-font. Globaal als --font-sans (zie globals.css).
const sora = localFont({
  src: "./fonts/sora.woff2",
  variable: "--font-sora",
  weight: "300 800",
  display: "swap",
});

// Geist Mono blijft voor monospace (code/refs/SKUs in tabellen).
const geistMono = localFont({
  src: "./fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  weight: "400 500",
  display: "swap",
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
