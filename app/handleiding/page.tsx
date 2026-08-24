import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { crmUrl } from "@/lib/crm-url";

import { handleidingHtml } from "./handleiding-html";

/**
 * Handboek voor het CRM — bedoeld om als link te delen met het team. De route
 * staat op de publieke lijst in `auth.config.ts` zodat WhatsApp/mail-scrapers
 * de metadata (titel + deelkaart uit `opengraph-image.tsx`) kunnen lezen, maar
 * de INHOUD is alleen voor ingelogde gebruikers: zonder sessie toont de pagina
 * een inlog-verwijzing in plaats van het handboek. Achter de proxy zetten zou
 * de deelkaart breken (de scraper wordt dan naar /login gestuurd).
 */
export const metadata: Metadata = {
  metadataBase: new URL(crmUrl()),
  title: "Handboek",
  description:
    "Zo werken we met het Habitat CRM: het dagelijkse ritme, de tien belangrijkste taken stap voor stap, en waar je alles vindt.",
  openGraph: {
    title: "Habitat CRM Handboek",
    description:
      "Zo werken we met het Habitat CRM: het dagelijkse ritme, de tien belangrijkste taken stap voor stap, en waar je alles vindt.",
    url: "/handleiding",
    siteName: "Habitat One",
    locale: "nl_NL",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Habitat CRM Handboek",
    description:
      "Het dagelijkse ritme, de tien belangrijkste taken stap voor stap, en waar je alles vindt.",
  },
  robots: { index: false, follow: false }, // deelbaar via de link, maar niet voor zoekmachines
};

export default async function HandleidingPage() {
  const session = await auth();

  // Interne spelregels (marges, kortingen) — alleen voor ingelogde gebruikers.
  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a98a4b]">
          Habitat One
        </p>
        <h1 className="text-2xl font-bold">CRM Handboek</h1>
        <p className="text-muted">
          Dit handboek is alleen voor het team. Log in en je komt hier direct terug.
        </p>
        <Link
          href="/login?callbackUrl=%2Fhandleiding"
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-foreground"
        >
          Inloggen
        </Link>
      </main>
    );
  }

  // Statische huisstijl-HTML uit hetzelfde bestand als de rest van dit segment.
  return <div dangerouslySetInnerHTML={{ __html: handleidingHtml }} />;
}
