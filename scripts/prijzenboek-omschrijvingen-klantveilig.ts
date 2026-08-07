/**
 * Omschrijvingen klantveilig maken — 07-08-2026.
 *
 * De omschrijving van een prijzenboek-post komt LETTERLIJK op de offerte van
 * de klant terecht (`lib/document-pdf.tsx:743` en de accept-pagina
 * `app/offerte/[token]/page.tsx`). In de seed-teksten stond onze kostopbouw:
 * "± € 500 materiaal + € 1.500 arbeid (± 60 u)". Daarmee lag ons uurtarief én
 * onze marge op straat bij elke verstuurde offerte.
 *
 * Kostprijs, marge, uren en materiaal zelf worden nergens aan de klant
 * getoond — die staan alleen in het prijzenboek en op de interne regels.
 * Alleen de omschrijving lekte, en die zegt nu wat er inbegrepen is zonder
 * hoe het is opgebouwd.
 *
 * Idempotent.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/prijzenboek-omschrijvingen-klantveilig.ts
 *   ... --dry
 */
import "./load-env";

import { eq } from "drizzle-orm";

import { db } from "../lib/db";
import { priceBookItems } from "../lib/db/schema";

/** naam → nieuwe, klantveilige omschrijving. */
const OMSCHRIJVINGEN: Record<string, string> = {
  "Afwerkvloer / dekvloer": "zandcement dekvloer over de vloerverwarming, klaar voor tegelwerk",
  "Airco kanaalsysteem (conductos)":
    "per aangesloten ruimte: aandeel unit, kanalen en roosters; excl. verlaagd plafond (aparte post)",
  "Airco split-unit (basis)": "geleverd, geplaatst en in bedrijf gesteld, incl. leidingset",
  "Badkamer installatie compleet":
    "al het leiding- en afvoerwerk per badkamer: aanvoer en afvoer naar elk tappunt, incl. afmontage; sanitair staat per stuk hieronder",
  "Boiler / termo vervangen": "elektrische boiler geleverd en aangesloten",
  "Buitendeur": "Yo Home / Exterior Door Set, geplaatst incl. cilinder",
  "Carport": "hout met dakbedekking, ± 3×5 m, geleverd en gemonteerd",
  "Dak renoveren (pannen)": "pannen vervangen incl. panlatten en onderfolie",
  "Dakisolatie": "isolatieplaten aan binnen- of buitenzijde",
  "Elektrapunt vernieuwen": "schakelaar of wandcontactdoos incl. bekabeling",
  "Gevelisolatie (SATE) incl. afwerking": "isolatieplaten, wapening en sierpleister",
  "Groepenkast vernieuwen": "vernieuwd conform de huidige norm, incl. keuring",
  "Hekwerk": "geplaatst per strekkende meter, incl. palen en fundering",
  // "Eigen producten" bestaat niet meer als apart kopje — de productposten
  // staan gewoon als eigen regels in dezelfde lijst/fase.
  "Inloopdouche monteren": "montage van douchebak, goot, doucheset en glaswand — de inloopdouche zelf staat als aparte regel",
  "Bad plaatsen": "alleen plaatsen en aansluiten, incl. kraanwerk-montage — het bad zelf staat als aparte regel",
  "Wastafelmeubel + kraan monteren": "ophangen, kraan plaatsen en aansluiten — meubel en kraan staan als aparte regel",
  "Hangtoilet monteren (incl. inbouwframe)": "montage incl. inbouwframe en afwerkplaat — het toilet zelf staat als aparte regel",
  "Keuken plaatsen": "montage en aansluitingen voor water, elektra en afvoer",
  "Kozijn (aluminium, geleverd en geplaatst)":
    "aluminium met thermische onderbreking, incl. beglazing en montage — per m² kozijnoppervlak (b × h)",
  "Mechanische ventilatie badkamer": "afzuiging incl. kanaal naar buiten (kernboring), per badkamer",
  "Plat dak waterdicht maken": "tela asfáltica of EPDM, incl. voorbereiding",
  "Poort (elektrisch)": "geleverd en geplaatst, incl. motor en bediening",
  "Schilderwerk binnen": "muren en plafonds sausen, 2 lagen; rekent automatisch mee met de stucwerk-maten",
  "Schilderwerk buiten / gevel": "incl. voorbehandeling; rekent automatisch mee met de stucwerk-maten",
  "Septictank vervangen": "nieuwe tank geleverd en geplaatst, incl. graaf- en aansluitwerk",
  "Terras aanleggen": "incl. fundering en tegels",
  "Verlaagd plafond (gyproc)": "incl. profielen en afwerking, excl. spots",
  "Verlichtingspunt aanleggen": "incl. bekabeling en afmontage; het armatuur uit de eigen collectie is apart",
  "Wandpanelen": "wandpanelen uit eigen collectie, incl. plaatsen op XPS-ondergrond — serie naar keuze",
  "Warmtepomp + installatie": "lucht/water incl. buffervat, geplaatst en ingeregeld",
  "Binnendeur leveren en afhangen": "Hotel Suite-deur met beslag, geleverd en afgehangen",
  "SPC / PVC vloer": "SPC-vloer uit eigen collectie, gelegd incl. ondervloer en plinten",
  "Parket / laminaat leggen": "klikvloer gelegd, incl. ondervloer en plinten",
};

/** Wat er niet in klantteksten hoort: onze kostopbouw of urenaantallen. */
const VERDACHT = /(\d\s*u\b|\bu\))|(\+\s*€)|(€\s*[\d.]+\s*(materiaal|arbeid|montage|plaatsing|plaatsen|installatie|levering))/i;

async function main() {
  const dry = process.argv.includes("--dry");
  const posten = await db.select().from(priceBookItems);
  let gewijzigd = 0;

  for (const p of posten) {
    const nieuw = OMSCHRIJVINGEN[p.name];
    if (!nieuw || p.description === nieuw) continue;
    console.log(`${p.name}\n  was: ${p.description}\n  nu:  ${nieuw}\n`);
    gewijzigd++;
    if (!dry) {
      await db
        .update(priceBookItems)
        .set({ description: nieuw, updatedAt: new Date() })
        .where(eq(priceBookItems.id, p.id));
    }
  }

  console.log(`${dry ? "[DRY RUN] " : ""}${gewijzigd} omschrijvingen bijgewerkt.\n`);

  // Controle: staat er nog ergens een kostopbouw in een tekst die de klant ziet?
  const na = dry ? posten : await db.select().from(priceBookItems);
  const lekken = na
    .filter((p) => p.active)
    .flatMap((p) => [
      ...(p.description && VERDACHT.test(p.description) ? [`${p.name} → omschrijving: ${p.description}`] : []),
      ...(p.stelpostNote && VERDACHT.test(p.stelpostNote) ? [`${p.name} → stelpost-notitie: ${p.stelpostNote}`] : []),
    ]);
  if (lekken.length) {
    console.log("LET OP — nog kostopbouw in klantzichtbare tekst:");
    for (const l of lekken) console.log(`  ${l}`);
  } else {
    console.log("Controle: geen uurtarieven of kostopbouw meer in klantzichtbare teksten.");
  }
  process.exit(0);
}

main();
