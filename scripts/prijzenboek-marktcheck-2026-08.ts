/**
 * Prijzenboek: kostopbouw en marktcheck — 07-08-2026.
 *
 * Elke post krijgt zijn kost als OPBOUW in plaats van als los bedrag:
 *
 *     kost = uren × € 28 (ploegtarief)  +  materiaal
 *     verkoop = kost ÷ (1 − marge)
 *
 * Het ploegtarief staat als `UURTARIEF_ONDERAANNEMER` in lib/price-book.ts en
 * is het maximum dat we de ploeg betalen (klopt met de hoogste
 * `workers.hourlyCostEur` in het systeem). Onze marge komt daar bovenop.
 * Gaat het tarief ooit omhoog, dan verandert die ene constante en rekent het
 * hele prijzenboek mee — geen 76 losse bedragen die uit elkaar groeien.
 *
 * HERKOMST VAN DE CIJFERS — belangrijk bij het nakijken:
 *  · Uurtarief € 28: hard, uit `workers` en de facturen van Ahmed (€ 5.376 ÷
 *    192 u = exact € 28,00) en Ferhaoui. Zerghini-ploeg zit op € 26.
 *  · Materiaal van EIGEN producten (wandpanelen, SPC/PVC, sanitair, haarden,
 *    kozijnen): landed cost uit de catalogus — dus inclusief vracht en invoer,
 *    niet de fabrieksprijs. Die opslag is per collectie gemeten: wandpanelen
 *    ×1,55, badkamer ×1,345, PVC ×1,40.
 *  · Materiaal van INGEKOCHT bouwmateriaal (tegels, lijm, cement, dakpannen,
 *    elektra, leidingwerk): staat NIET in ons systeem — dit zijn externe
 *    marktschattingen voor de Costa Blanca en de posten die Nick het scherpst
 *    moet nakijken.
 *  · Normuren per eenheid: extern. `time_entries` bevat wel uren en tarieven,
 *    maar geen werksoort en geen oppervlakte, dus uren per m² zijn niet uit
 *    eigen data af te leiden.
 *
 * Waar we te goedkoop stonden is de prijs omhoog gegaan: een stelpost die
 * onder onze eigen inkoopprijs ligt kost geld bij elke klus.
 *
 * Snijverlies (10%) op alles wat op maat wordt gezaagd: tegels, terrastegels,
 * wandpanelen, parket en SPC. Dat zat vroeger verstopt in een opgehoogde
 * m²-prijs; nu zit het zichtbaar in het AANTAL. Netto-effect op een offerte is
 * daardoor ongeveer gelijk, maar je ziet nu wat je bestelt.
 *
 * Idempotent: meerdere keren draaien geeft hetzelfde resultaat.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/prijzenboek-marktcheck-2026-08.ts
 *   ... --dry    toont alleen wat er zou veranderen
 */
import "./load-env";

import { eq } from "drizzle-orm";

import { db } from "../lib/db";
import { priceBookItems } from "../lib/db/schema";
import { UURTARIEF_ONDERAANNEMER } from "../lib/price-book";

type Post = {
  hoofdstuk: string;
  naam: string;
  /** Uren ploeg per eenheid. */
  uren: number;
  /** Materiaalkost per eenheid (excl. btw). */
  materiaal: number;
  /** Marge als % van de verkoopprijs. */
  marge: number;
  /** Snijverlies % — alleen voor wat op maat gezaagd wordt. */
  snij?: number;
  /** Waarom deze uren/dit materiaal. Komt in de log, niet in de database. */
  waarom: string;
};

const POSTEN: Post[] = [
  /* ── Sloopwerk ─────────────────────────────────────────────────────── */
  { hoofdstuk: "Sloopwerk", naam: "Wanden slopen", uren: 0.8, materiaal: 4, marge: 30,
    waarom: "tabique met tegelwerk aan twee zijden, inclusief puin afvoeren naar de container" },
  { hoofdstuk: "Sloopwerk", naam: "Badkamer strippen", uren: 4, materiaal: 18, marge: 30,
    waarom: "volledige strip: sanitair eruit, wand- en vloertegels eraf, leidingen afdoppen" },
  { hoofdstuk: "Sloopwerk", naam: "Vloer verwijderen", uren: 0.45, materiaal: 2, marge: 30,
    waarom: "tegels breken plus egaliseren van de ondergrond" },
  { hoofdstuk: "Sloopwerk", naam: "Container & stortkosten", uren: 0, materiaal: 6.5, marge: 30,
    waarom: "geen arbeid — puur container en stortkosten per m² sloopwerk" },

  /* ── Ruwbouw & wanden ──────────────────────────────────────────────── */
  { hoofdstuk: "Ruwbouw & wanden", naam: "Binnenwand opbouwen", uren: 1.3, materiaal: 18, marge: 30,
    waarom: "ladrillo hueco doble met mortel, klaar voor stucwerk" },

  /* ── Dakwerk ───────────────────────────────────────────────────────── */
  { hoofdstuk: "Dakwerk", naam: "Dak renoveren (pannen)", uren: 1.2, materiaal: 38, marge: 30,
    waarom: "pannen eraf, onderconstructie nakijken, waterkerende laag en nieuwe pannen" },
  { hoofdstuk: "Dakwerk", naam: "Plat dak waterdicht maken", uren: 0.6, materiaal: 26, marge: 30,
    waarom: "reinigen, primer en twee lagen bitumen of vloeibare coating" },
  { hoofdstuk: "Dakwerk", naam: "Dakisolatie", uren: 0.35, materiaal: 24, marge: 30,
    waarom: "isolatieplaten inclusief bevestiging" },

  /* ── Stucwerk ──────────────────────────────────────────────────────── */
  { hoofdstuk: "Stucwerk", naam: "Stucwerk binnen", uren: 0.6, materiaal: 5, marge: 30,
    waarom: "yeso in twee lagen, schuurklaar" },
  { hoofdstuk: "Stucwerk", naam: "Stucwerk buiten / gevel", uren: 1, materiaal: 10, marge: 30,
    waarom: "monocapa inclusief steiger en voorbehandeling" },
  { hoofdstuk: "Stucwerk", naam: "Gevelisolatie (SATE) incl. afwerking", uren: 1.3, materiaal: 34, marge: 30,
    waarom: "isolatieplaat, wapeningsnet, pleisterlaag en afwerking" },

  /* ── Schilderwerk ──────────────────────────────────────────────────── */
  { hoofdstuk: "Schilderwerk", naam: "Schilderwerk binnen", uren: 0.3, materiaal: 3, marge: 30,
    waarom: "voorstrijk plus twee lagen, inclusief afplakken" },
  { hoofdstuk: "Schilderwerk", naam: "Schilderwerk buiten / gevel", uren: 0.45, materiaal: 5.5, marge: 30,
    waarom: "gevelverf, twee lagen, inclusief steiger" },

  /* ── Tegelwerk (snijverlies!) ──────────────────────────────────────── */
  { hoofdstuk: "Tegelwerk", naam: "Vloertegels leggen", uren: 0.9, materiaal: 38, marge: 30, snij: 10,
    waarom: "tegelstelpost € 32/m² plus lijm en voeg € 6; ± 10 m² per man per dag" },
  { hoofdstuk: "Tegelwerk", naam: "Wandtegels badkamer", uren: 1.05, materiaal: 35, marge: 30, snij: 10,
    waarom: "wandwerk is trager dan vloerwerk; tegelstelpost € 29/m² plus lijm en voeg" },
  { hoofdstuk: "Tegelwerk", naam: "Vloertegels badkamer", uren: 1, materiaal: 38, marge: 30, snij: 10,
    waarom: "kleine ruimte met veel paswerk rond afvoer en douchehoek" },

  /* ── Vloeren, wanden & plafonds ────────────────────────────────────── */
  { hoofdstuk: "Vloeren, wanden & plafonds", naam: "Wandpanelen", uren: 0.6, materiaal: 27, marge: 65, snij: 10,
    waarom: "eigen data (294 panelen): landed € 20,00/m² plus XPS-montageplaat ± € 7/m². De oude kost van € 65 was ruim 2× te hoog — verkoopprijs blijft € 125, we maakten er dus al 65% marge op in plaats van de geboekte 48%" },
  { hoofdstuk: "Vloeren, wanden & plafonds", naam: "Verlaagd plafond (gyproc)", uren: 0.9, materiaal: 22, marge: 30,
    waarom: "metalstud regelwerk, gyproc, voegen en schuurklaar" },
  { hoofdstuk: "Vloeren, wanden & plafonds", naam: "Parket / laminaat leggen", uren: 0.4, materiaal: 30, marge: 33, snij: 10,
    waarom: "klikvloer met ondervloer en plinten" },
  { hoofdstuk: "Vloeren, wanden & plafonds", naam: "Afwerkvloer / dekvloer", uren: 0.35, materiaal: 12, marge: 30,
    waarom: "cementdekvloer, geen snijverlies (gegoten)" },
  { hoofdstuk: "Vloeren, wanden & plafonds", naam: "Microcement vloer of wand", uren: 1.4, materiaal: 46, marge: 30,
    waarom: "arbeidsintensief laagsysteem; naadloos, dus geen snijverlies" },
  { hoofdstuk: "Vloeren, wanden & plafonds", naam: "SPC / PVC vloer", uren: 0.35, materiaal: 16, marge: 64, snij: 10,
    waarom: "eigen catalogus: landed € 11,10/m² plus ondervloer en plinten; verkoop blijft ± € 72 (catalogusprijs € 37,15/m² materiaal plus leggen)" },
  { hoofdstuk: "Vloeren, wanden & plafonds", naam: "Waterdamphaard", uren: 2.5, materiaal: 455, marge: 55,
    waarom: "eigen catalogus sfeerhaarden: landed ± € 455 (inkoop € 294 × 1,55); komt uit op de catalogus-verkoopprijs van ± € 1.166" },

  /* ── Badkamers & sanitair ──────────────────────────────────────────── */
  { hoofdstuk: "Badkamers & sanitair", naam: "Badkamer installatie compleet", uren: 60, materiaal: 320, marge: 30,
    waarom: "leidingwerk, afvoeren, aansluiten en afmontage van een complete badkamer" },
  { hoofdstuk: "Badkamers & sanitair", naam: "Inloopdouche monteren", uren: 7, materiaal: 4, marge: 30,
    waarom: "alleen montage-uren; de douche zelf zit in de stelpost-post" },
  { hoofdstuk: "Badkamers & sanitair", naam: "Bad plaatsen", uren: 5, materiaal: 10, marge: 30,
    waarom: "stellen, waterpas zetten en aansluiten" },
  { hoofdstuk: "Badkamers & sanitair", naam: "Wastafelmeubel + kraan monteren", uren: 2.5, materiaal: 10, marge: 30,
    waarom: "ophangen en aansluiten" },
  { hoofdstuk: "Badkamers & sanitair", naam: "Hangtoilet monteren (incl. inbouwframe)", uren: 4, materiaal: 223, marge: 30,
    waarom: "inbouwframe (materiaal) plus inmetselen en aansluiten" },
  { hoofdstuk: "Badkamers & sanitair", naam: "Mechanische ventilatie badkamer", uren: 4, materiaal: 188, marge: 30,
    waarom: "ventilator, kanaal en doorvoer" },
  // LET OP — deze vier zijn MATERIAAL-stelposten (uren = 0). De arbeid zit al in
  // de montageposten hierboven, die op dezelfde maat draaien (douches, baden,
  // wastafels, toiletten). Uren hier nog eens meetellen zou de arbeid van elke
  // badkamer dubbel op de offerte zetten.
  { hoofdstuk: "Badkamers & sanitair", naam: "Inloopdouche compleet", uren: 0, materiaal: 1158, marge: 50,
    waarom: "eigen catalogus landed: douchebak € 306 + glazen wand € 552 + doucheset € 242 + afvoergoot € 58. De oude € 987 lag ónder onze eigen inkoop — hier stonden we te goedkoop" },
  { hoofdstuk: "Badkamers & sanitair", naam: "Bad + badkraan", uren: 0, materiaal: 1400, marge: 47,
    waarom: "eigen catalogus landed: bad € 926–1.473 (gemiddeld € 1.237) plus badkraan met af- en overloop" },
  { hoofdstuk: "Badkamers & sanitair", naam: "Wastafelmeubel, kraan en spiegel", uren: 0, materiaal: 941, marge: 42,
    waarom: "eigen catalogus landed: wastafel ø € 287, kraan € 140, spiegel € 159, afvoer/sifon € 67 (Basin Drainage KKR-PU004), plus meubel" },
  { hoofdstuk: "Badkamers & sanitair", naam: "Hangtoilet incl. accessoires", uren: 0, materiaal: 235, marge: 62,
    waarom: "eigen catalogus landed: pot € 126–165 plus zitting en bedieningsplaat € 47" },

  /* ── Loodgieterwerk ────────────────────────────────────────────────── */
  { hoofdstuk: "Loodgieterwerk", naam: "Waterleiding vernieuwen", uren: 4, materiaal: 38, marge: 43,
    waarom: "per tappunt: leiding trekken, aansluiten en dichtzetten" },
  { hoofdstuk: "Loodgieterwerk", naam: "Afvoer vernieuwen", uren: 1.8, materiaal: 15, marge: 30,
    waarom: "per strekkende meter, inclusief hak- en dichtwerk" },
  { hoofdstuk: "Loodgieterwerk", naam: "Septictank vervangen", uren: 40, materiaal: 5880, marge: 30,
    waarom: "fosa 4.000 l plus graafwerk en aansluiting; was € 9.000 kost met 10% marge — dat lag onder onze 15%-norm, verkoopprijs blijft € 10.000" },
  { hoofdstuk: "Loodgieterwerk", naam: "Boiler / termo vervangen", uren: 3, materiaal: 366, marge: 30,
    waarom: "termo elektrisch inclusief plaatsen en aansluiten" },

  /* ── Elektra ───────────────────────────────────────────────────────── */
  { hoofdstuk: "Elektra", naam: "Elektrapunt vernieuwen", uren: 2, materiaal: 22, marge: 30,
    waarom: "hakken, buis en draad trekken, afmonteren" },
  { hoofdstuk: "Elektra", naam: "Groepenkast vernieuwen", uren: 16, materiaal: 1002, marge: 30,
    waarom: "kast, automaten en aardlekschakelaars plus keuring" },
  { hoofdstuk: "Elektra", naam: "Alarmsysteem", uren: 8, materiaal: 976, marge: 30,
    waarom: "stelpost: centrale, sensoren en installatie" },
  { hoofdstuk: "Elektra", naam: "Hoofdbekabeling vernieuwen", uren: 0.25, materiaal: 5, marge: 30,
    waarom: "per m² woonoppervlak omgeslagen" },
  { hoofdstuk: "Elektra", naam: "Internetaansluiting (UTP)", uren: 1.5, materiaal: 18, marge: 30,
    waarom: "kabel trekken en wandcontactdoos" },
  { hoofdstuk: "Elektra", naam: "TV-aansluiting (coax)", uren: 1.4, materiaal: 16, marge: 30,
    waarom: "kabel trekken en wandcontactdoos" },
  { hoofdstuk: "Elektra", naam: "Camera (bewaking)", uren: 2.5, materiaal: 180, marge: 30,
    waarom: "camera, bekabeling en inregelen" },

  /* ── Airco & klimaat ───────────────────────────────────────────────── */
  { hoofdstuk: "Airco & klimaat", naam: "Airco split-unit (basis)", uren: 8, materiaal: 1276, marge: 30,
    waarom: "unit, leidingwerk, doorvoer en vacuümtrekken" },
  { hoofdstuk: "Airco & klimaat", naam: "Airco kanaalsysteem (conductos)", uren: 10, materiaal: 670, marge: 30,
    waarom: "per aangesloten ruimte: kanaal, rooster en inregelen" },
  { hoofdstuk: "Airco & klimaat", naam: "Warmtepomp + installatie", uren: 24, materiaal: 7828, marge: 37,
    waarom: "aerotermia inclusief buffervat en inregelen" },
  { hoofdstuk: "Airco & klimaat", naam: "Vloerverwarming", uren: 0.5, materiaal: 41, marge: 30,
    waarom: "leidingwerk, verdeler en inregelen; dekvloer is een aparte post" },

  /* ── Verlichting ───────────────────────────────────────────────────── */
  { hoofdstuk: "Verlichting", naam: "Verlichtingspunt aanleggen", uren: 1.6, materiaal: 20, marge: 30,
    waarom: "punt aanleggen inclusief schakelaar-bedrading" },
  { hoofdstuk: "Verlichting", naam: "Buitenverlichting (wand)", uren: 2, materiaal: 39, marge: 30,
    waarom: "waterdichte armatuur en doorvoer door de gevel" },
  { hoofdstuk: "Verlichting", naam: "Tuin-/terrasverlichting", uren: 1.8, materiaal: 34.6, marge: 30,
    waarom: "grondkabel ingraven en armatuur plaatsen" },
  { hoofdstuk: "Verlichting", naam: "LED-strips binnen", uren: 0.35, materiaal: 12.2, marge: 30,
    waarom: "per strekkende meter inclusief profiel en driver-aandeel" },
  { hoofdstuk: "Verlichting", naam: "LED-strips buiten (waterdicht)", uren: 0.45, materiaal: 17.4, marge: 30,
    waarom: "IP65-strip en profiel, per strekkende meter" },

  /* ── Binnendeuren ──────────────────────────────────────────────────── */
  { hoofdstuk: "Binnendeuren", naam: "Binnendeur leveren en afhangen", uren: 3, materiaal: 521, marge: 35,
    waarom: "stelpost: deur, kozijn en beslag plus afhangen" },
  { hoofdstuk: "Binnendeuren", naam: "Buitendeur", uren: 5, materiaal: 677, marge: 39,
    waarom: "stelpost: veiligheidsdeur inclusief plaatsen" },
  { hoofdstuk: "Binnendeuren", naam: "Trap vervangen", uren: 40, materiaal: 3380, marge: 30,
    waarom: "stelpost: trap op maat inclusief plaatsen" },
  { hoofdstuk: "Binnendeuren", naam: "Balustrade / leuning", uren: 1.5, materiaal: 118, marge: 30,
    waarom: "per strekkende meter, rvs of glas" },

  /* ── Kozijnen ──────────────────────────────────────────────────────── */
  { hoofdstuk: "Kozijnen", naam: "Kozijn (aluminium, geleverd en geplaatst)", uren: 1.5, materiaal: 606, marge: 45,
    waarom: "LET OP, grootste wijziging. € 391/m² is de FABRIEKSprijs; eigen kozijnfacturen laten consequent een landed-opslag van 1,55× zien (FAC-2026-0036: leverancier € 9.438 → landed € 14.629), dus € 606/m² landed. Diezelfde facturen zijn met 50-51% marge verkocht; 45% is de voorzichtige kant daarvan" },

  /* ── Keuken ────────────────────────────────────────────────────────── */
  { hoofdstuk: "Keuken", naam: "Keuken plaatsen", uren: 70, materiaal: 440, marge: 30,
    waarom: "opbouw, waterpas stellen, aansluiten en afmonteren" },
  { hoofdstuk: "Keuken", naam: "Keuken leveren", uren: 0, materiaal: 10000, marge: 30,
    waarom: "stelpost keuken; marge stond op 23% en gaat naar de norm van 30%" },

  /* ── Zwembad ───────────────────────────────────────────────────────── */
  { hoofdstuk: "Zwembad", naam: "Nieuw zwembad", uren: 12, materiaal: 564, marge: 30,
    waarom: "per m² wateroppervlak: grondwerk, schil, installatie en afwerking; marge van 28% naar de norm van 30%" },
  { hoofdstuk: "Zwembad", naam: "Zwembad renoveren", uren: 4, materiaal: 188, marge: 30,
    waarom: "per m²: strippen, herstellen en nieuwe afwerking" },

  /* ── Buitenruimte ──────────────────────────────────────────────────── */
  { hoofdstuk: "Buitenruimte", naam: "Terras aanleggen", uren: 0.9, materiaal: 58, marge: 30, snij: 10,
    waarom: "terrastegels op maat gezaagd, dus snijverlies; inclusief zandcement en voegen" },
  { hoofdstuk: "Buitenruimte", naam: "Tuinaanleg", uren: 0.5, materiaal: 21, marge: 30,
    waarom: "grondwerk, aarde en beplanting" },
  { hoofdstuk: "Buitenruimte", naam: "Oprit", uren: 0.7, materiaal: 55, marge: 30,
    waarom: "fundering en klinkers of beton" },
  { hoofdstuk: "Buitenruimte", naam: "Pergola / zonwering", uren: 20, materiaal: 2940, marge: 30,
    waarom: "stelpost: aluminium pergola inclusief montage" },
  { hoofdstuk: "Buitenruimte", naam: "Zonnepanelen (per paneel)", uren: 2, materiaal: 394, marge: 30,
    waarom: "paneel, aandeel omvormer en montage" },
  { hoofdstuk: "Buitenruimte", naam: "Buitenkeuken", uren: 40, materiaal: 3380, marge: 30,
    waarom: "stelpost: gemetselde buitenkeuken met werkblad en apparatuur" },
  { hoofdstuk: "Buitenruimte", naam: "Carport", uren: 24, materiaal: 2328, marge: 40,
    waarom: "stelpost: constructie inclusief dakbedekking" },
  { hoofdstuk: "Buitenruimte", naam: "Rejas / raambeveiliging", uren: 2, materiaal: 294, marge: 30,
    waarom: "smeedwerk op maat inclusief plaatsen" },
  { hoofdstuk: "Buitenruimte", naam: "Irrigatiesysteem tuin", uren: 0.1, materiaal: 5.2, marge: 30,
    waarom: "per m² tuin: leidingen, sproeiers en programmeur" },

  /* ── Hekwerk & poort ───────────────────────────────────────────────── */
  { hoofdstuk: "Hekwerk & poort", naam: "Hekwerk", uren: 1.2, materiaal: 61.4, marge: 30,
    waarom: "per strekkende meter inclusief palen en fundering" },
  { hoofdstuk: "Hekwerk & poort", naam: "Poort (elektrisch)", uren: 10, materiaal: 2520, marge: 30,
    waarom: "stelpost: poort, motor en besturing" },

  /* ── Aanbouw & kelder ──────────────────────────────────────────────── */
  { hoofdstuk: "Aanbouw & kelder", naam: "Aanbouw casco", uren: 12, materiaal: 614, marge: 30,
    waarom: "per m²: fundering, muren en dak, casco opgeleverd" },
  { hoofdstuk: "Aanbouw & kelder", naam: "Kelder uitgraven", uren: 1.2, materiaal: 61.4, marge: 30,
    waarom: "per m³: uitgraven, afvoeren en grondkering" },
];

const eur = (n: number) => `€ ${n.toFixed(2)}`;

async function main() {
  const dry = process.argv.includes("--dry");
  const bestaand = await db.select().from(priceBookItems);
  const index = new Map(bestaand.map((p) => [`${p.chapter}||${p.name}`, p]));

  let gewijzigd = 0;
  let ongewijzigd = 0;
  const nietGevonden: string[] = [];

  for (const post of POSTEN) {
    const huidig = index.get(`${post.hoofdstuk}||${post.naam}`);
    if (!huidig) {
      nietGevonden.push(`${post.hoofdstuk} / ${post.naam}`);
      continue;
    }
    const kost = Math.round((post.uren * UURTARIEF_ONDERAANNEMER + post.materiaal) * 100) / 100;
    const prijs = post.marge < 100 ? Math.round(kost / (1 - post.marge / 100)) : kost;
    const snij = post.snij ?? 0;

    const zelfde =
      Number(huidig.costEur ?? -1) === kost &&
      Number(huidig.priceEur ?? -1) === prijs &&
      Number(huidig.marginPct) === post.marge &&
      Number(huidig.wastePct) === snij &&
      huidig.laborHours != null &&
      Number(huidig.laborHours) === post.uren;
    if (zelfde) {
      ongewijzigd++;
      continue;
    }

    const oudePrijs = huidig.priceEur != null ? Number(huidig.priceEur) : null;
    const verschil = oudePrijs != null && oudePrijs > 0 ? ((prijs - oudePrijs) / oudePrijs) * 100 : null;
    console.log(
      `${post.hoofdstuk} / ${post.naam}\n` +
        `   ${post.uren} u × ${eur(UURTARIEF_ONDERAANNEMER)} + ${eur(post.materiaal)} materiaal = ${eur(kost)} kost` +
        `  →  ${post.marge}% marge  →  ${eur(prijs)}` +
        (verschil != null ? `  (was ${eur(oudePrijs!)}, ${verschil >= 0 ? "+" : ""}${verschil.toFixed(0)}%)` : "") +
        (snij ? `  · +${snij}% snijverlies op het aantal` : "") +
        `\n   ${post.waarom}`,
    );
    gewijzigd++;

    if (!dry) {
      await db
        .update(priceBookItems)
        .set({
          laborHours: String(post.uren),
          materialCostEur: post.materiaal.toFixed(2),
          costEur: kost.toFixed(2),
          marginPct: String(post.marge),
          priceEur: prijs.toFixed(2),
          wastePct: String(snij),
          needsReview: false,
          updatedAt: new Date(),
        })
        .where(eq(priceBookItems.id, huidig.id));
    }
  }

  // De placeholder-post hoort niet in de wizard: hij heeft geen prijs (die
  // producten kies je via de productkiezer) en vervuilt de "zonder prijs"-teller.
  const placeholder = index.get("Badkamers & sanitair||Badkamerproducten uit eigen catalogus");
  if (placeholder?.active) {
    console.log("\nPlaceholder 'Badkamerproducten uit eigen catalogus' wordt gedeactiveerd (geen prijs, producten via de productkiezer).");
    if (!dry) {
      await db
        .update(priceBookItems)
        .set({ active: false, needsReview: false, updatedAt: new Date() })
        .where(eq(priceBookItems.id, placeholder.id));
    }
  }

  console.log(`\n${dry ? "[DRY RUN] " : ""}${gewijzigd} posten bijgewerkt, ${ongewijzigd} al goed.`);
  if (nietGevonden.length) {
    console.log(`Niet gevonden in het prijzenboek (naam gewijzigd?): ${nietGevonden.join(", ")}`);
  }
  const restZonderOpbouw = bestaand.filter(
    (p) => p.active && !POSTEN.some((x) => x.hoofdstuk === p.chapter && x.naam === p.name),
  );
  if (restZonderOpbouw.length) {
    console.log(`Zonder kostopbouw gebleven: ${restZonderOpbouw.map((p) => p.name).join(", ")}`);
  }
  process.exit(0);
}

main();
