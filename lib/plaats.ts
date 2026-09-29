/**
 * Stad en land van een bezoeker.
 *
 * Het formulier vraagt ze apart: een veld voor de stad en een keuzelijst voor
 * het land. Dat is betrouwbaarder dan één regel raden — "Praag, Tsjechië" gaf
 * geen landcode, en dan staat er niets op de kaart.
 *
 * `splitsPlaats` blijft bestaan als vangnet: iemand tikt in het stadveld toch
 * "Valencia, España", en dan halen we het land er alsnog uit. Puur, zodat de
 * rariteiten te testen zijn zonder database of internet.
 */

import { isLandcode, landNaam } from "@/lib/landen";

/** Landnamen zoals bezoekers ze typen → ISO-landcode, zoals `contacts.country`. */
const LANDEN: Record<string, string> = {
  españa: "ES",
  espana: "ES",
  spanje: "ES",
  spain: "ES",
  spanien: "ES",
  espagne: "ES",
  nederland: "NL",
  netherlands: "NL",
  holland: "NL",
  "the netherlands": "NL",
  belgië: "BE",
  belgie: "BE",
  belgium: "BE",
  belgique: "BE",
  deutschland: "DE",
  germany: "DE",
  duitsland: "DE",
  allemagne: "DE",
  france: "FR",
  frankrijk: "FR",
  frankreich: "FR",
  italia: "IT",
  italy: "IT",
  italië: "IT",
  italie: "IT",
  portugal: "PT",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  engeland: "GB",
  "great britain": "GB",
  ireland: "IE",
  ierland: "IE",
  polska: "PL",
  poland: "PL",
  polen: "PL",
  schweiz: "CH",
  switzerland: "CH",
  zwitserland: "CH",
  suisse: "CH",
  österreich: "AT",
  osterreich: "AT",
  austria: "AT",
  oostenrijk: "AT",
  sverige: "SE",
  sweden: "SE",
  zweden: "SE",
  norge: "NO",
  norway: "NO",
  noorwegen: "NO",
  danmark: "DK",
  denmark: "DK",
  denemarken: "DK",
  usa: "US",
  "united states": "US",
  marruecos: "MA",
  morocco: "MA",
  marokko: "MA",
};

export interface Plaats {
  /** Wat de bezoeker als plaats bedoelde ("Valencia"). */
  plaats: string;
  /** ISO-landcode als we die uit de tekst konden halen, anders null. */
  land: string | null;
  /** De hele regel zoals getypt — wat we aan de geocoder geven. */
  zoekterm: string;
}

/** Herkent een land aan het eind van de regel; de rest is de plaats. */
export function splitsPlaats(tekst: string | null | undefined): Plaats | null {
  const schoon = (tekst ?? "").replace(/\s+/g, " ").trim();
  if (schoon.length < 2) return null;

  const delen = schoon.split(",").map((d) => d.trim()).filter(Boolean);
  const laatste = delen.length > 1 ? delen[delen.length - 1].toLowerCase() : "";
  const land = LANDEN[laatste] ?? null;
  const plaats = (land ? delen.slice(0, -1).join(", ") : delen.join(", ")).trim();

  // "España" alleen — geen plaats, wel een land. Dan is er niets om te tonen.
  if (!plaats) {
    const alleenLand = LANDEN[schoon.toLowerCase()];
    return alleenLand ? { plaats: schoon, land: alleenLand, zoekterm: schoon } : null;
  }
  return { plaats, land, zoekterm: schoon };
}

/**
 * Stad en land zoals we het tonen: "Valencia · Spanje", in de taal van het
 * scherm. Zonder land alleen de stad — dat staat netter dan een leeg streepje.
 */
export function plaatsLabel(plaats: string | null, land: string | null, taal = "nl"): string {
  return [plaats?.trim() || null, land?.trim() ? landNaam(land, taal) : null].filter(Boolean).join(" · ");
}

/**
 * Stad en land samen, zoals de bezoeker ze invulde: het stadveld met de
 * landkeuze erachter als vangnet uit de tekst ("Valencia, España").
 */
export function leesPlaats(stad: string | null | undefined, landcode: string | null | undefined): Plaats | null {
  const uitTekst = splitsPlaats(stad);
  const gekozen = isLandcode(landcode) ? landcode!.toUpperCase() : null;
  if (!uitTekst) return gekozen ? { plaats: "", land: gekozen, zoekterm: "" } : null;
  // Een gekozen land wint van wat er in het stadveld staat: dat is een keuze,
  // geen gok.
  const land = gekozen ?? uitTekst.land;
  return { plaats: uitTekst.plaats, land, zoekterm: uitTekst.plaats };
}
