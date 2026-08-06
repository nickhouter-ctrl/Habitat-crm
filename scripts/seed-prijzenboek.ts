/**
 * Vult het prijzenboek met de posten en INDICATIEVE startprijzen.
 *
 * Alle bedragen zijn Costa Blanca-indicaties en staan gemarkeerd als
 * "controleer" (needs_review) tot iemand ze op /prijzenboek bevestigt of
 * aanpast — dit zijn startwaarden, geen waarheid. Marge 30% van de
 * verkoopprijs (keuze Nick 06-08-2026); verkoop = kost ÷ 0,70, afgerond.
 *
 * Idempotent: bestaande posten (zelfde hoofdstuk + naam) blijven ongemoeid,
 * dus aangepaste prijzen overleven een nieuwe run.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-prijzenboek.ts
 */
import "./load-env";

import { sql } from "drizzle-orm";

import { db } from "../lib/db";

type Post = {
  h: string; n: string; d?: string; unit: string; driver: string; factor?: number;
  kost: number | null; stelpost?: string; marge?: number;
};

const MEERPRIJS = "middenklasse inbegrepen — duurdere keuze wordt als meerprijs verrekend";

const POSTEN: Post[] = [
  // ── Sloopwerk ──
  { h: "Sloopwerk", n: "Wanden slopen", d: "incl. afvoer puin", unit: "m²", driver: "sloop_wanden_m2", kost: 28 },
  { h: "Sloopwerk", n: "Badkamer strippen", d: "sanitair en tegels verwijderen, incl. afvoer — per m² badkamervloer", unit: "m²", driver: "badkamer_m2", kost: 130 },
  { h: "Sloopwerk", n: "Vloer verwijderen", d: "bestaande vloer/tegels eruit, incl. afvoer", unit: "m²", driver: "woonoppervlak_m2", kost: 14 },
  { h: "Sloopwerk", n: "Container & stortkosten", d: "afvoer en stort — ± 1 container per ± 50 m² sloopwerk; rekent automatisch over wanden + vloeren + badkamers", unit: "m²", driver: "sloop_totaal_m2", kost: 6 },

  // ── Ruwbouw & wanden ──
  { h: "Ruwbouw & wanden", n: "Binnenwand opbouwen", d: "gasbeton/steen incl. materiaal", unit: "m²", driver: "opbouw_wanden_m2", kost: 55 },

  // ── Stucwerk ──
  { h: "Stucwerk", n: "Stucwerk binnen", d: "glad, 2 lagen, schilderklaar", unit: "m²", driver: "stuc_binnen_m2", kost: 22 },
  { h: "Stucwerk", n: "Stucwerk buiten / gevel", d: "incl. voorbehandeling", unit: "m²", driver: "stuc_buiten_m2", kost: 38 },

  // ── Schilderwerk ──
  { h: "Schilderwerk", n: "Schilderwerk binnen", d: "muren en plafonds sausen, 2 lagen — ± € 3 materiaal + € 9 arbeid per m²", unit: "m²", driver: "stuc_binnen_m2", kost: 12 },
  { h: "Schilderwerk", n: "Schilderwerk buiten / gevel", d: "incl. voorbehandeling — ± € 5 materiaal + € 13 arbeid per m²", unit: "m²", driver: "stuc_buiten_m2", kost: 18 },

  // ── Tegelwerk ──
  { h: "Tegelwerk", n: "Vloertegels leggen", d: "incl. lijm en voegen", unit: "m²", driver: "woonoppervlak_m2", kost: 38,
    stelpost: `keramische tegels t/m € 30/m² inbegrepen — ${MEERPRIJS}` },
  { h: "Tegelwerk", n: "Wandtegels badkamer", d: "wanden betegelen — ± 5 m² wand per m² badkamervloer", unit: "m²", driver: "badkamer_m2", factor: 5, kost: 42,
    stelpost: `tegels t/m € 30/m² inbegrepen — ${MEERPRIJS}` },

  // ── Vloeren & plafonds ──
  { h: "Vloeren & plafonds", n: "Verlaagd plafond (gyproc)", d: "incl. profielen en afwerking, excl. spots — ± € 18 materiaal + € 30 arbeid per m²", unit: "m²", driver: "plafond_m2", kost: 48 },
  { h: "Vloeren & plafonds", n: "Parket / laminaat leggen", d: "incl. ondervloer en plinten — ± € 25 laminaat + € 35 leggen per m² (verkoop)", unit: "m²", driver: "parket_m2", kost: 40, marge: 33,
    stelpost: "laminaat t/m € 25/m² inbegrepen — duurdere keuze (parket) wordt als meerprijs verrekend" },
  { h: "Vloeren & plafonds", n: "Afwerkvloer / dekvloer", d: "zandcement dekvloer over de vloerverwarming, klaar voor tegelwerk — ± € 8 materiaal + € 14 arbeid per m²", unit: "m²", driver: "vloerverwarming_m2", kost: 22 },
  { h: "Vloeren & plafonds", n: "SPC / PVC vloer (eigen collectie)", d: "eigen collectie (€ 37,50/m² verkoop) + € 35 leggen incl. ondervloer en plinten", unit: "m²", driver: "spc_m2", kost: 31, marge: 58,
    stelpost: "dessin naar keuze uit de collectie — prijs per serie volgens de prijslijst" },
  { h: "Vloeren & plafonds", n: "Microcement vloer of wand", d: "meerlaags aangebracht incl. toplaag", unit: "m²", driver: "microcement_m2", kost: 85,
    stelpost: "kleur en textuur naar keuze — definitieve prijs na proefstaal" },

  // ── Badkamers & sanitair ──
  { h: "Badkamers & sanitair", n: "Badkamer installatie compleet", d: "al het leiding- en afvoerwerk per badkamer: aanvoer/afvoer naar elk tappunt, incl. afmontage — sanitair zelf staat per stuk hieronder", unit: "stuk", driver: "badkamers", kost: 2400 },
  { h: "Badkamers & sanitair", n: "Inloopdouche monteren", d: "montage douchebak, goot, doucheset en glaswand — alleen arbeid; de producten staan bij Eigen producten", unit: "stuk", driver: "douches", kost: 200 },
  { h: "Badkamers & sanitair", n: "Bad plaatsen", d: "alleen plaatsen en aansluiten, incl. kraanwerk-montage — het bad zelf staat bij Eigen producten", unit: "stuk", driver: "baden", kost: 150 },
  { h: "Badkamers & sanitair", n: "Wastafelmeubel + kraan monteren", d: "ophangen, kraan plaatsen en aansluiten — meubel en kraan staan bij Eigen producten", unit: "stuk", driver: "wastafels", kost: 80 },
  { h: "Badkamers & sanitair", n: "Hangtoilet monteren (incl. inbouwframe)", d: "montage incl. inbouwframe en afwerkplaat (frame is materiaal) — het toilet staat bij Eigen producten", unit: "stuk", driver: "toiletten", kost: 335 },

  // ── Loodgieterwerk ──
  { h: "Loodgieterwerk", n: "Waterleiding vernieuwen", d: "per aftappunt", unit: "punt", driver: "handmatig", kost: 185 },
  { h: "Loodgieterwerk", n: "Afvoer vernieuwen", unit: "m", driver: "handmatig", kost: 65 },
  { h: "Loodgieterwerk", n: "Septictank vervangen", d: "levering en plaatsing nieuwe tank — ± € 3.500 tank + € 5.500 graaf- en aansluitwerk", unit: "forfait", driver: "handmatig", kost: 9000,
    stelpost: "alleen indien de bestaande tank defect blijkt; werkelijke staat is pas zichtbaar na opgraven" },

  // ── Elektra ──
  { h: "Elektra", n: "Elektrapunt vernieuwen", d: "schakelaar of wandcontactdoos incl. bekabeling", unit: "punt", driver: "elektrapunten", kost: 78 },
  { h: "Elektra", n: "Groepenkast vernieuwen", d: "conform huidige norm", unit: "forfait", driver: "handmatig", kost: 1450 },

  // ── Airco & klimaat ──
  { h: "Airco & klimaat", n: "Airco split-unit (basis)", d: "geplaatst en in bedrijf gesteld — ± € 1.000 unit en leidingset + € 500 montage", unit: "stuk", driver: "aircounits", kost: 1500, stelpost: MEERPRIJS },
  { h: "Airco & klimaat", n: "Airco kanaalsysteem (conductos)", d: "per aangesloten ruimte: aandeel unit, kanalen en roosters — ± € 700 levering + € 250 installatie; excl. verlaagd plafond (aparte post)", unit: "stuk", driver: "kanaalairco_ruimtes", kost: 950, stelpost: "capaciteit en merk na warmteverliesberekening; compleet systeem in Spanje € 3.500–8.000 instalado" },
  { h: "Airco & klimaat", n: "Warmtepomp + installatie", d: "lucht/water incl. buffervat en inregelen — ± € 7.000 levering + € 2.500 installatie", unit: "stuk", driver: "warmtepompen", kost: 9500,
    stelpost: "capaciteit en merk in overleg — definitieve prijs na warmteverliesberekening" },
  { h: "Airco & klimaat", n: "Vloerverwarming", d: "incl. verdeler, excl. afwerkvloer (aparte post)", unit: "m²", driver: "vloerverwarming_m2", kost: 55 },

  // ── Verlichting ──
  { h: "Verlichting", n: "Verlichtingspunt aanleggen", d: "incl. bekabeling en afmontage", unit: "punt", driver: "verlichtingspunten", kost: 65,
    stelpost: "armaturen uit eigen collectie — model naar keuze, meerprijs bij duurdere serie" },

  // ── Binnendeuren ──
  { h: "Binnendeuren", n: "Binnendeur leveren en afhangen", d: "incl. beslag", unit: "stuk", driver: "binnendeuren", kost: 380,
    stelpost: `standaard vlakke deur inbegrepen — ${MEERPRIJS} (bv. Yo Home of maatwerk)` },
  { h: "Binnendeuren", n: "Buitendeur", d: "incl. beslag en cilinder", unit: "stuk", driver: "handmatig", kost: 850, stelpost: MEERPRIJS },

  // ── Kozijnen ──
  { h: "Kozijnen", n: "Kozijn (aluminium, geleverd en geplaatst)", d: "aluminium met thermische onderbreking, incl. beglazing en montage — ± € 490 levering + € 110 plaatsing per m² kozijnoppervlak (b × h)", unit: "m²", driver: "kozijnen_m2", kost: 600,
    stelpost: "kunststof (PVC) is voordeliger (± € 390/m² levering, uit eigen leveringen); definitief na opmeting per kozijn" },

  // ── Keuken ──
  { h: "Keuken", n: "Keuken plaatsen", d: "montage en aansluitingen water/elektra/afvoer — een week met 2 man: ± € 300 materiaal + € 2.100 arbeid (± 80 u)", unit: "forfait", driver: "keukens", kost: 2400 },
  { h: "Keuken", n: "Keuken leveren", d: "incl. apparatuur", unit: "forfait", driver: "keukens", kost: 10000, marge: 23, stelpost: MEERPRIJS },

  // ── Zwembad ──
  { h: "Zwembad", n: "Nieuw zwembad", d: "beton, incl. techniek en afwerking — per m² wateroppervlak; 8×4 = 32 m² → € 52.000", unit: "m²", driver: "zwembad_m2", kost: 1250, marge: 23,
    stelpost: "bij rotsachtige ondergrond geldt een meerprijs voor het uitgraven, op regiebasis" },
  { h: "Zwembad", n: "Zwembad renoveren", d: "nieuwe afwerking en techniek — prijs per m² wateroppervlak", unit: "m²", driver: "zwembad_renovatie_m2", kost: 300, stelpost: MEERPRIJS },

  // ── Buitenruimte ──
  { h: "Buitenruimte", n: "Terras aanleggen", d: "incl. fundering en tegels", unit: "m²", driver: "terras_m2", kost: 85, stelpost: `tegels t/m € 35/m² inbegrepen — ${MEERPRIJS}` },
  { h: "Buitenruimte", n: "Tuinaanleg", d: "grondwerk en basisbeplanting", unit: "m²", driver: "tuin_m2", kost: 35, stelpost: MEERPRIJS },
  { h: "Buitenruimte", n: "Oprit", d: "incl. fundering", unit: "m²", driver: "oprit_m2", kost: 75 },
  { h: "Buitenruimte", n: "Pergola / zonwering", d: "geleverd en gemonteerd", unit: "forfait", driver: "pergolas", kost: 3500,
    stelpost: "maat en uitvoering bepalen de definitieve prijs — middenklasse aluminium inbegrepen" },
  { h: "Buitenruimte", n: "Zonnepanelen (per paneel)", d: "incl. omvormer en installatie naar rato", unit: "stuk", driver: "zonnepanelen", kost: 450,
    stelpost: "definitieve prijs na dakinspectie en legplan" },
  { h: "Buitenruimte", n: "Carport", d: "hout met dakbedekking, ± 3×5 m — ± € 2.700 levering + € 800 montage", unit: "stuk", driver: "carports", kost: 3500,
    stelpost: "maat, uitvoering en fundering bepalen de definitieve prijs" },
  { h: "Buitenruimte", n: "Buitenkeuken", d: "gemetseld/beton met werkblad, excl. apparatuur", unit: "forfait", driver: "buitenkeukens", kost: 4500,
    stelpost: "uitvoering en apparatuur naar keuze — meerprijs wordt verrekend" },

  // ── Hekwerk & poort ──
  { h: "Hekwerk & poort", n: "Hekwerk", d: "geplaatst", unit: "m", driver: "hekwerk_m", kost: 95 },
  { h: "Hekwerk & poort", n: "Poort (elektrisch)", d: "incl. motor en bediening", unit: "stuk", driver: "poorten", kost: 2800, stelpost: MEERPRIJS },

  // ── Aanbouw & kelder ──
  { h: "Aanbouw & kelder", n: "Aanbouw casco", d: "fundering, wanden en dak, wind- en waterdicht", unit: "m²", driver: "aanbouw_m2", kost: 950 },
  { h: "Aanbouw & kelder", n: "Kelder uitgraven", d: "graven en afvoer grond", unit: "m³", driver: "kelder_m3", kost: 95,
    stelpost: "bij rots of hardere grondslag dan verwacht geldt een meerprijs, op regiebasis" },

  // ── Eigen producten ──
  { h: "Eigen producten", n: "Wandpanelen (eigen collectie)", d: "serie naar keuze uit de Habitat-collectie, geplaatst", unit: "m²", driver: "handmatig", kost: null, marge: 45,
    stelpost: "prijs per serie volgens de prijslijst — gekozen serie bepaalt de definitieve prijs" },
  // Automatisch per badkamer-samenstelling; prijzen worden live uit de
  // catalogus ververst (lib/sanitair-prijzen.ts).
  { h: "Eigen producten", n: "Doucheset compleet (eigen collectie)", d: "douchebak, doucheset en glaswand — verkoopprijzen uit de eigen catalogus (gem. serie)", unit: "stuk", driver: "douches", kost: 1100, marge: 44,
    stelpost: "gemiddelde serie uit de collectie — gekozen model bepaalt de definitieve prijs" },
  { h: "Eigen producten", n: "Bad (eigen collectie)", d: "vrijstaand bad — verkoopprijs uit de eigen catalogus (gem. serie)", unit: "stuk", driver: "baden", kost: 1238, marge: 36,
    stelpost: "gemiddelde serie uit de collectie — gekozen model bepaalt de definitieve prijs" },
  { h: "Eigen producten", n: "Wastafelmeubel + kraan (eigen collectie)", d: "meubel, kraan en afvoerset — verkoopprijzen uit de eigen catalogus (gem. serie)", unit: "stuk", driver: "wastafels", kost: 785, marge: 44,
    stelpost: "gemiddelde serie uit de collectie — gekozen model bepaalt de definitieve prijs" },
  { h: "Eigen producten", n: "Hangtoilet (eigen collectie)", d: "hangtoilet — verkoopprijs uit de eigen catalogus (gem. serie)", unit: "stuk", driver: "toiletten", kost: 145, marge: 65,
    stelpost: "gemiddelde serie uit de collectie — gekozen model bepaalt de definitieve prijs" },
  { h: "Eigen producten", n: "Badkamerproducten uit eigen catalogus", d: "kranen, spiegels en accessoires — kies de producten in de offerte-editor via de productkiezer", unit: "forfait", driver: "handmatig", kost: null, marge: 45, stelpost: MEERPRIJS },
];

async function main() {
  const rond = (n: number) => Math.round(n);
  let nieuw = 0;
  for (let i = 0; i < POSTEN.length; i++) {
    const p = POSTEN[i];
    const marge = p.marge ?? 30;
    const prijs = p.kost != null ? rond(p.kost / (1 - marge / 100)) : null;
    const r = await db.execute(sql`
      insert into price_book_items (chapter, name, description, unit, driver, factor, cost_eur, margin_pct, price_eur, is_stelpost, stelpost_note, sort_order)
      values (${p.h}, ${p.n}, ${p.d ?? null}, ${p.unit}, ${p.driver}, ${p.factor ?? 1}, ${p.kost}, ${marge}, ${prijs}, ${!!p.stelpost}, ${p.stelpost ?? null}, ${i})
      on conflict (chapter, name) do nothing
      returning id`);
    if (r.length) nieuw++;
  }
  const [t] = await db.execute<{ n: number }>(sql`select count(*)::int n from price_book_items`);
  console.log(`${nieuw} posten toegevoegd · totaal ${t.n} in het prijzenboek (alle nieuwe staan op "controleer")`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
