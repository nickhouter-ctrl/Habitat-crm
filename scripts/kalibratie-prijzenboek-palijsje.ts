/**
 * Prijzenboek-kalibratie op project 't Palijsje (17-08-2026).
 *
 * Aanleiding: de calculator kwam voor 't Palijsje op € 603.914 ex btw
 * (OFF-2026-0026) waar € 300.000 is begroot. De werkelijke cijfers van de
 * uitgevoerde fase (volledige sloop + kelder 500 m³ uitgraven + start
 * fundering) zijn € 45.812 ex btw all-in, terwijl de calculator alleen al
 * voor sloop + kelder € 66.678 aan KOSTEN rekende (verkoop € 95.375).
 *
 * Twee ingrepen, allebei aan de kostenkant (de marges blijven zoals Nick ze
 * heeft gezet):
 *
 * 1. Uurtarief: blijft € 28 (keuze Nick 17-08 — buffer boven de werkelijk
 *    betaalde € 24,10/u). Staat in lib/price-book.ts; hier rekenen we de
 *    opgeslagen kost- en verkoopprijzen ermee door.
 * 2. Normuren en materiaal-marktschattingen per post bijgesteld waar de
 *    seed aantoonbaar te hoog zat. Grootste uitschieter: "Kelder uitgraven"
 *    had 1,2 manuur + € 61,40 afvoer per m³ (per ongeluk de seed van
 *    "Hekwerk" — identieke getallen); machinaal graven kost geen 1,2 manuur
 *    per m³. Werkelijk deed de ploeg sloop + 500 m³ kelder + funderingstart
 *    voor € 45,8k totaal.
 *
 * Alle aangepaste posten krijgen needs_review = true (de "controleer"-badge),
 * zodat Nick ze naloopt. Handmatig gezette verkoopprijzen (prijs ≠ formule,
 * zoals de twee tegelposten) worden NIET overschreven — alleen de kost wordt
 * herrekend.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const TARIEF = 28; // moet gelijk zijn aan UURTARIEF_ONDERAANNEMER (Nick 17-08: 28 blijft)

/** Bijstellingen per post: nieuwe normuren en/of materiaalkost per eenheid. */
const BIJSTELLINGEN: Record<string, { u?: number; mat?: number; reden: string }> = {
  // — Sloop & grondwerk: gekalibreerd op de werkelijke Palijsje-cijfers —
  "Kelder uitgraven": { u: 0.2, mat: 28, reden: "was de hekwerk-seed (1,2 u + € 61,40/m³); machinaal graven + afvoer, werkelijk ± € 30–35/m³ kost" },
  "Wanden slopen": { u: 0.45, reden: "0,8 manuur per m² wand slopen is te veel voor ploegwerk" },
  "Badkamer strippen": { u: 2, reden: "4 u/m² = 36 uur voor een badkamer van 9 m²; werkelijk ± de helft" },
  "Vloer verwijderen": { u: 0.35, reden: "licht bijgesteld naar ploegtempo" },
  // — Ruwbouw & afwerking: Costa Blanca-marktprijzen —
  "Binnenwand opbouwen": { u: 1.1, reden: "tabique + afwerking, marktconform ± € 50–65 verkoop" },
  "Stucwerk binnen": { u: 0.5, reden: "enlucido ± € 20–28/m² verkoop in de regio" },
  "Stucwerk buiten / gevel": { u: 0.8, reden: "monocapa ± € 35–45/m² verkoop" },
  "Gevelisolatie (SATE) incl. afwerking": { u: 1.1, reden: "SATE ± € 60–90/m² verkoop" },
  "Schilderwerk binnen": { u: 0.25, reden: "sausen 2 lagen ± € 10–14/m² verkoop" },
  "Schilderwerk buiten / gevel": { u: 0.4, reden: "marktconform bijgesteld" },
  "Verlaagd plafond (gyproc)": { u: 0.7, mat: 20, reden: "falso techo ± € 45–60/m² verkoop" },
  "Microcement vloer of wand": { u: 1.2, mat: 40, reden: "microcemento ± € 80–120/m² verkoop" },
  // — Techniek —
  "Elektrapunt vernieuwen": { u: 1.4, reden: "punto eléctrico ± € 60–90 verkoop" },
  "Hoofdbekabeling vernieuwen": { u: 0.2, reden: "licht bijgesteld" },
  "Internetaansluiting (UTP)": { u: 1.2, reden: "licht bijgesteld" },
  "TV-aansluiting (coax)": { u: 1.2, reden: "licht bijgesteld" },
  "Verlichtingspunt aanleggen": { u: 1.2, reden: "licht bijgesteld" },
  "Buitenverlichting (wand)": { u: 1.5, reden: "licht bijgesteld" },
  "Tuin-/terrasverlichting": { u: 1.4, reden: "licht bijgesteld" },
  "Groepenkast vernieuwen": { u: 12, mat: 800, reden: "cuadro eléctrico vernieuwd ± € 900–1.600 verkoop" },
  "Waterleiding vernieuwen": { u: 2.5, reden: "4 u per aftappunt is te veel" },
  "Afvoer vernieuwen": { u: 1.2, reden: "licht bijgesteld" },
  "Septictank vervangen": { u: 30, mat: 3500, reden: "fosa séptica geleverd + graafwerk ± € 5.000–7.000 verkoop" },
  "Airco kanaalsysteem (conductos)": { u: 6, mat: 900, reden: "conductos-systeem 5 ruimtes ± € 7–9k totaal, was € 14k" },
  "Warmtepomp + installatie": { mat: 6000, reden: "aerotermia incl. buffervat ± € 9,5–13k verkoop, was € 13,5k" },
  "Vloerverwarming": { u: 0.45, mat: 35, reden: "licht bijgesteld" },
  // — Sanitair montage —
  "Badkamer installatie compleet": { u: 40, reden: "60 uur leidingwerk per badkamer is te veel; ± € 1.400–2.000 verkoop" },
  "Inloopdouche monteren": { u: 5, reden: "licht bijgesteld" },
  "Bad plaatsen": { u: 3, reden: "licht bijgesteld" },
  "Wastafelmeubel + kraan monteren": { u: 2, reden: "licht bijgesteld" },
  "Hangtoilet monteren (incl. inbouwframe)": { u: 3, reden: "licht bijgesteld" },
  "Mechanische ventilatie badkamer": { u: 3, reden: "licht bijgesteld" },
  // — Keuken, dak, buiten —
  "Keuken plaatsen": { u: 45, reden: "70 uur montage is te veel; ± € 2.000–2.500 verkoop" },
  "Dak renoveren (pannen)": { u: 0.9, mat: 35, reden: "retejar ± € 70–95/m² verkoop" },
  "Plat dak waterdicht maken": { u: 0.5, reden: "licht bijgesteld" },
  "Terras aanleggen": { u: 0.8, mat: 45, reden: "terraza porcelánico ± € 70–100/m² verkoop" },
  "Oprit": { mat: 45, reden: "licht bijgesteld" },
  "Aanbouw casco": { u: 10, mat: 550, reden: "casco-nieuwbouw ± € 800/m² kost" },
  "Nieuw zwembad": { u: 10, mat: 500, reden: "8×4-betonbad ± € 30–38k verkoop totaal" },
  "Zwembad renoveren": { u: 3.5, mat: 170, reden: "licht bijgesteld" },
  "Trap vervangen": { u: 30, mat: 2500, reden: "marktconform bijgesteld" },
};

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  try {
    const rows = await sql`
      select id, name, labor_hours, material_cost_eur, cost_eur, margin_pct, price_eur
      from price_book_items where active order by name`;

    let aangepast = 0;
    let herrekend = 0;
    for (const r of rows) {
      const uOud = r.labor_hours == null ? null : Number(r.labor_hours);
      const matOud = r.material_cost_eur == null ? null : Number(r.material_cost_eur);
      // Catalogus-/collectieposten (kost niet uit uren-opbouw): overslaan.
      if (uOud == null && matOud == null) continue;
      const kostOud = Number(r.cost_eur ?? 0);
      const margeOud = Number(r.margin_pct ?? 0);
      const prijsOud = r.price_eur == null ? null : Number(r.price_eur);
      // Volgde de verkoopprijs de formule? Zo nee: handmatig gezet, afblijven.
      const formulePrijs = margeOud < 100 ? Math.round(kostOud / (1 - margeOud / 100)) : null;
      const prijsIsFormule = prijsOud != null && formulePrijs != null && Math.abs(prijsOud - formulePrijs) <= 1;

      const bij = BIJSTELLINGEN[r.name];
      const uNieuw = bij?.u ?? uOud ?? 0;
      const matNieuw = bij?.mat ?? matOud ?? 0;
      // Sanitair-sets met 0 uur volgen de catalogus, niet de uren-opbouw.
      if (!bij && (uOud ?? 0) === 0) continue;

      const kostNieuw = Math.round((uNieuw * TARIEF + matNieuw) * 100) / 100;
      const prijsNieuw = prijsIsFormule && margeOud < 100
        ? Math.round(kostNieuw / (1 - margeOud / 100))
        : prijsOud;

      if (kostNieuw === kostOud && prijsNieuw === prijsOud && !bij) continue;

      await sql`
        update price_book_items set
          labor_hours = ${uNieuw},
          material_cost_eur = ${matNieuw},
          cost_eur = ${kostNieuw},
          price_eur = ${prijsNieuw},
          needs_review = ${bij ? true : sql`needs_review`},
          updated_at = now()
        where id = ${r.id}`;

      const tag = bij ? "BIJGESTELD" : "tarief-herrekend";
      console.log(
        `${tag.padEnd(17)} ${r.name.padEnd(42)} u ${String(uOud ?? "-").padStart(5)}→${String(uNieuw).padStart(5)}  mat ${String(matOud ?? "-").padStart(8)}→${String(matNieuw).padStart(8)}  kost ${String(kostOud).padStart(8)}→${String(kostNieuw).padStart(8)}  vk ${String(prijsOud ?? "-").padStart(6)}→${String(prijsNieuw ?? "-").padStart(6)}${prijsIsFormule ? "" : "  (verkoopprijs handmatig — niet aangeraakt)"}`,
      );
      if (bij) aangepast += 1;
      else herrekend += 1;
    }
    console.log(`\n${aangepast} posten bijgesteld (normuren/materiaal), ${herrekend} alleen tarief-herrekend.`);

    // Ter controle: wat zou OFF-2026-0026 met de nieuwe prijzen zijn?
    const [doc] = await sql`select items from documents where doc_number = 'OFF-2026-0026'`;
    if (doc) {
      const boek = await sql`select name, price_eur from price_book_items where active`;
      const prijsPerNaam = new Map(boek.map((b) => [b.name as string, Number(b.price_eur ?? 0)]));
      let oud = 0;
      let nieuw = 0;
      let onvoorzienOud = 0;
      for (const it of doc.items as { name: string; units: number; price: number }[]) {
        const bedragOud = Number(it.units) * Number(it.price);
        if (it.name.startsWith("Onvoorzien")) {
          onvoorzienOud = bedragOud;
          continue;
        }
        oud += bedragOud;
        const p = prijsPerNaam.get(it.name);
        nieuw += Number(it.units) * (p && p > 0 ? p : Number(it.price));
      }
      const factor = onvoorzienOud > 0 ? 1.1 : 1;
      console.log(
        `\nOFF-2026-0026 nagerekend: was ${Math.round(oud * factor).toLocaleString("nl-NL")} → wordt ± ${Math.round(nieuw * factor).toLocaleString("nl-NL")} ex btw (incl. 10% onvoorzien; de offerte zelf is NIET gewijzigd).`,
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
