/**
 * Seed van de copy-bibliotheek (`copy_blocks`) — brief §2: copy komt uit
 * vastgelegde tekstblokken en invulpatronen, géén LLM in het draaipad.
 *
 *   npx tsx lib/db/seed-marketing-copy.ts
 *
 * Idempotent: bestaande blokken (zelfde hoek + taal + rol + tekst/patroon)
 * worden overgeslagen; handmatig toegevoegde blokken blijven staan.
 *
 * Redactionele uitgangspunten (brief §8c): Spaans is eersterangs geschreven,
 * geen vertaling vanuit het Engels — elke taal heeft eigen, natuurlijke
 * regels. Tokens: {category} (productcategorie), {price_from} (vanafprijs,
 * per taal genoteerd door lib/marketing/copy-suggest.ts), {finish}
 * (afwerking). Blokken met tokens staan in `pattern`; letterlijke tekst in
 * `text`.
 */
import "../../scripts/load-env"; // eerst — laadt .env.local vóór lib/db

import { and, eq, isNull, or } from "drizzle-orm";

import { db, pgClient } from "./index";
import { copyBlocks } from "./schema";

type Angle = "material" | "price" | "showroom" | "project" | "seasonal";
type Locale = "nl" | "en" | "es" | "de";
type Role = "eyebrow" | "headline" | "subline" | "cta";

interface SeedBlock {
  angle: Angle;
  locale: Locale;
  role: Role;
  /** Letterlijke tekst óf (bij tokens) het invulpatroon. */
  text: string;
  hasTokens?: boolean;
}

/** Compacte notatie: per hoek en taal de rollen; headline mag 2 varianten. */
const LIBRARY: Record<Angle, Record<Locale, Partial<Record<Role, string[]>>>> = {
  material: {
    es: {
      eyebrow: ["Materiales que convencen"],
      headline: [
        "La piedra que se adapta a tu pared",
        "{category}: el acabado marca la diferencia",
      ],
      subline: ["Paneles ligeros, montaje limpio y acabado {finish} con aspecto de cantera."],
      cta: ["Pide tu muestra gratis"],
    },
    nl: {
      eyebrow: ["Materiaal met karakter"],
      headline: ["Steenlook zonder breekwerk", "{category}: het verschil zit in de afwerking"],
      subline: ["Lichte panelen, strakke montage en een afwerking in {finish}."],
      cta: ["Vraag een gratis staal aan"],
    },
    en: {
      eyebrow: ["Materials that convince"],
      headline: ["Stone looks, none of the rubble", "{category}: the finish makes the wall"],
      subline: ["Lightweight panels, clean installation, a {finish} finish that reads like quarry stone."],
      cta: ["Request a free sample"],
    },
    de: {
      eyebrow: ["Material mit Charakter"],
      headline: ["Steinoptik ohne Baustelle", "{category}: das Finish macht den Unterschied"],
      subline: ["Leichte Paneele, saubere Montage, Oberfläche in {finish}."],
      cta: ["Gratis Muster anfordern"],
    },
  },
  price: {
    es: {
      eyebrow: ["Precio claro, sin sorpresas"],
      headline: ["Renueva tu pared desde {price_from}", "{category} desde {price_from}"],
      subline: ["Presupuesto cerrado en 48 horas, sin letra pequeña."],
      cta: ["Calcula tu precio"],
    },
    nl: {
      eyebrow: ["Duidelijke prijs, geen verrassingen"],
      headline: ["Nieuwe wand vanaf {price_from}", "{category} al vanaf {price_from}"],
      subline: ["Vaste offerte binnen 48 uur, zonder kleine lettertjes."],
      cta: ["Bereken je prijs"],
    },
    en: {
      eyebrow: ["Clear pricing, no surprises"],
      headline: ["A new wall from {price_from}", "{category} from {price_from}"],
      subline: ["Fixed quote within 48 hours — no small print."],
      cta: ["Get your price"],
    },
    de: {
      eyebrow: ["Klare Preise, keine Überraschungen"],
      headline: ["Neue Wand ab {price_from}", "{category} schon ab {price_from}"],
      subline: ["Festes Angebot innerhalb von 48 Stunden, ohne Kleingedrucktes."],
      cta: ["Preis berechnen"],
    },
  },
  showroom: {
    es: {
      eyebrow: ["Showroom en Xàbia"],
      headline: ["Tócalo antes de decidir", "Ven a ver {category} en persona"],
      subline: ["Camí de la Fontana 3, Jávea — aparca en la puerta y sal con ideas."],
      cta: ["Reserva tu visita"],
    },
    nl: {
      eyebrow: ["Showroom in Xàbia"],
      headline: ["Eerst voelen, dan kiezen", "Bekijk {category} in het echt"],
      subline: ["Camí de la Fontana 3, Jávea — parkeren voor de deur, advies in het Nederlands."],
      cta: ["Plan je bezoek"],
    },
    en: {
      eyebrow: ["Showroom in Xàbia"],
      headline: ["See it, touch it, then decide", "Experience {category} in real life"],
      subline: ["Camí de la Fontana 3, Jávea — parking at the door, advice in English."],
      cta: ["Book your visit"],
    },
    de: {
      eyebrow: ["Showroom in Xàbia"],
      headline: ["Erst anfassen, dann entscheiden", "{category} live erleben"],
      subline: ["Camí de la Fontana 3, Jávea — Parkplatz vor der Tür, Beratung auf Deutsch."],
      cta: ["Besuch planen"],
    },
  },
  project: {
    es: {
      eyebrow: ["De proyecto a realidad"],
      headline: ["Tu reforma, de principio a fin", "Así se transforma una casa en la Costa Blanca"],
      subline: ["Medimos, montamos y entregamos con nuestro propio equipo."],
      cta: ["Cuéntanos tu proyecto"],
    },
    nl: {
      eyebrow: ["Van plan naar oplevering"],
      headline: ["Jouw verbouwing, van begin tot eind", "Zo verandert een huis aan de Costa Blanca"],
      subline: ["Wij meten in, monteren en leveren op met ons eigen team."],
      cta: ["Vertel over je project"],
    },
    en: {
      eyebrow: ["From plan to handover"],
      headline: ["Your renovation, start to finish", "How a Costa Blanca home gets transformed"],
      subline: ["We measure, install and hand over with our own team."],
      cta: ["Tell us about your project"],
    },
    de: {
      eyebrow: ["Vom Plan zur Übergabe"],
      headline: ["Ihre Renovierung, von Anfang bis Ende", "So verwandelt sich ein Haus an der Costa Blanca"],
      subline: ["Wir messen auf, montieren und übergeben mit eigenem Team."],
      cta: ["Erzählen Sie uns von Ihrem Projekt"],
    },
  },
  seasonal: {
    es: {
      eyebrow: ["Temporada de renovar"],
      headline: ["Deja la casa lista antes del verano", "Este otoño, interior nuevo"],
      subline: ["Planifica ahora y estrena antes de la temporada."],
      cta: ["Planifica tu reforma"],
    },
    nl: {
      eyebrow: ["Tijd om te vernieuwen"],
      headline: ["Je huis klaar vóór de zomer", "Dit najaar een nieuw interieur"],
      subline: ["Plan nu en geniet ervan vóór het seizoen begint."],
      cta: ["Plan je verbouwing"],
    },
    en: {
      eyebrow: ["Renovation season"],
      headline: ["Get the house ready before summer", "A fresh interior this autumn"],
      subline: ["Plan now, enjoy it before the season starts."],
      cta: ["Plan your renovation"],
    },
    de: {
      eyebrow: ["Zeit für Neues"],
      headline: ["Das Haus fertig vor dem Sommer", "Diesen Herbst ein neues Zuhause"],
      subline: ["Jetzt planen und vor der Saison genießen."],
      cta: ["Renovierung planen"],
    },
  },
};

/** Plat maken naar losse blokken; tokens automatisch herkennen. */
function flatten(): SeedBlock[] {
  const blocks: SeedBlock[] = [];
  for (const [angle, locales] of Object.entries(LIBRARY) as Array<
    [Angle, Record<Locale, Partial<Record<Role, string[]>>>]
  >) {
    for (const [locale, roles] of Object.entries(locales) as Array<
      [Locale, Partial<Record<Role, string[]>>]
    >) {
      for (const [role, texts] of Object.entries(roles) as Array<[Role, string[]]>) {
        for (const text of texts) {
          blocks.push({ angle, locale, role, text, hasTokens: /\{\w+\}/.test(text) });
        }
      }
    }
  }
  return blocks;
}

async function main() {
  const blocks = flatten();
  let inserted = 0;
  let skipped = 0;

  for (const b of blocks) {
    // Idempotent: zelfde hoek+taal+rol met zelfde tekst óf patroon = overslaan.
    const [existing] = await db
      .select({ id: copyBlocks.id })
      .from(copyBlocks)
      .where(
        and(
          eq(copyBlocks.angle, b.angle),
          eq(copyBlocks.locale, b.locale),
          eq(copyBlocks.role, b.role),
          isNull(copyBlocks.productId),
          or(eq(copyBlocks.text, b.text), eq(copyBlocks.pattern, b.text)),
        ),
      )
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(copyBlocks).values({
      angle: b.angle,
      locale: b.locale,
      role: b.role,
      // Bij tokens is de tekst het patroon; text blijft dan leeg ("").
      text: b.hasTokens ? "" : b.text,
      pattern: b.hasTokens ? b.text : null,
      productId: null,
    });
    inserted++;
  }

  console.log(
    `copy_blocks: ${inserted} toegevoegd, ${skipped} bestonden al (totaal ${blocks.length} in de bibliotheek).`,
  );
  await pgClient.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
