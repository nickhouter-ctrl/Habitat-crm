/**
 * Van een webaanvraag naar offerteregels.
 *
 * De website stuurt mee wat de klant in de configurator koos. Bij een
 * merkassortiment is dat de **uitvoering**, niet het product: Donny Verboom
 * vroeg "BRA-5-GK-159" (Altijd open waste, geborsteld koper) en niet
 * "BRA-159-ALTIJD-OPEN-WASTE-1YYD". Het voorladen zocht alleen in `products`,
 * vond negen van de tien codes niet en zette die regels op € 0 — vandaar
 * "ik zie geen prijs als ik de offerte vanuit de aanvraag maak".
 *
 * Deze module is puur: de pagina zoekt de codes op (producten én uitvoeringen)
 * en geeft ze hier als kaart mee.
 */
import type { DocumentLineItem } from "@/lib/db/schema";

/** Wat één gevraagde regel in de catalogus opleverde. */
export type CatalogusTreffer = {
  productId: string;
  naam: string;
  /** Leeg bij een gewoon product; gevuld bij een uitvoering ("Geborsteld koper"). */
  uitvoering?: string | null;
  /** De code van de uitvoering — nodig om bij de leverancier te bestellen. */
  code?: string | null;
  prijsEur?: number | null;
  btw?: number | null;
  categorie?: string | null;
};

export type GevraagdeRegel = { sku?: string | null; naam?: string | null };

/**
 * Het aantal uit de naam vissen. De configurator schrijft het erachter:
 * "Binnendeur Compleet 720×2600 (bronze) × 7". Dat aantal staat nergens anders
 * in de aanvraag, dus zonder deze regel wordt zeven keer een deur als één stuk
 * geoffreerd — op die ene regel al ruim € 4.000 te weinig.
 */
export function aantalUitNaam(naam: string | null | undefined): { naam: string; aantal: number } {
  const schoon = (naam ?? "").trim();
  const m = /^(.*?)[\s]*[×x]\s*(\d{1,3})(\s*(stuks?|x))?$/i.exec(schoon);
  if (!m) return { naam: schoon, aantal: 1 };
  const aantal = Number(m[2]);
  // "720×2600" is een maat, geen aantal: dan blijft er links niets zinnigs over
  // of eindigt de naam op een cijfer.
  if (!m[1].trim() || !(aantal >= 1 && aantal <= 999) || /\d$/.test(m[1].trim())) {
    return { naam: schoon, aantal: 1 };
  }
  return { naam: m[1].trim(), aantal };
}

/** Sleutel waarop we matchen: hoofdletters en spaties doen er niet toe. */
export function codeSleutel(code: string | null | undefined): string {
  return (code ?? "").trim().toLowerCase();
}

/**
 * Bouw de offerteregels. Een code die nergens in de catalogus staat wordt géén
 * lege regel weggelaten maar blijft staan met de naam uit de aanvraag en prijs
 * 0 — zo zie je meteen wát er ontbreekt in plaats van dat het stilletjes
 * verdwijnt.
 */
export function offerteRegelsUitAanvraag(
  gevraagd: GevraagdeRegel[],
  treffers: Map<string, CatalogusTreffer>,
): DocumentLineItem[] {
  return gevraagd.map((g) => {
    const t = treffers.get(codeSleutel(g.sku));
    const { naam: gevraagdeNaam, aantal } = aantalUitNaam(g.naam);
    if (!t) {
      return {
        name: gevraagdeNaam || (g.sku ?? "").trim() || "Onbekend product",
        description: g.sku ? `niet in de catalogus gevonden (${g.sku})` : undefined,
        units: aantal,
        price: 0,
        discount: 0,
        taxRate: 21,
        category: "materiaal",
      };
    }
    const omschrijving = t.uitvoering
      ? t.code
        ? `${t.uitvoering} · ${t.code}`
        : t.uitvoering
      : (t.categorie ?? undefined);
    return {
      name: t.uitvoering ? `${t.naam} — ${t.uitvoering}` : t.naam,
      description: omschrijving || undefined,
      units: aantal,
      price: t.prijsEur != null ? Number(t.prijsEur) : 0,
      discount: 0,
      taxRate: t.btw ?? 21,
      category: "materiaal",
      productId: t.productId,
    };
  });
}
