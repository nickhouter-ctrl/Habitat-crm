/**
 * De urenregels van Wilhelmus factuur N° 3 stonden op het incl.-btw-tarief —
 * 24-08-2026.
 *
 * Arbeidskost rekent altijd ex btw: het uurtarief op een ploegkaart is dat ook,
 * en de btw op een inkoopfactuur is geen kostprijs. Bij deze factuur is het
 * INCLUSIEF-btw-totaal door de uren gedeeld: € 2.221,56 ÷ 68 = € 32,67, oftewel
 * € 27 + 21%. Daardoor stond er op vier werven 21% te veel arbeidskost.
 *
 * Zijn tarief is € 27 ex btw en dat klopt met de factuur zelf: het subtotaal van
 * € 1.836,00 gedeeld door 68 uur is exact € 27. De uren blijven dus staan; alleen
 * het tarief gaat terug naar € 27, waarmee de geboekte kost precies het
 * subtotaal van de factuur wordt.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/wilhelmus-0-03-tarief-herstellen.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const REFERENTIE = "Wilhelmus Mark Strijks 0-03";
const TARIEF = 27;

const eur = (n: number) => `€ ${n.toFixed(2)}`;

type Po = { id: string; reference: string; total: string; subtotal: string; tax: string };
type Regel = { id: string; project: string | null; hours: string; hourly_cost_eur: string };

async function main() {
  const dry = process.argv.includes("--dry");

  const [po] = (await pgClient`
    select id, reference, total::text, subtotal::text, tax::text
    from purchase_orders where reference = ${REFERENTIE}`) as unknown as Po[];
  if (!po) throw new Error(`Factuur "${REFERENTIE}" niet gevonden — gestopt.`);

  const regels = (await pgClient`
    select te.id, pr.name as project, te.hours::text, te.hourly_cost_eur::text
    from time_entries te left join projects pr on pr.id = te.project_id
    where te.purchase_order_id = ${po.id} and te.self_logged_at is null
    order by pr.name`) as unknown as Regel[];
  if (regels.length === 0) throw new Error("Geen urenregels aan deze factuur — gestopt.");

  const uren = regels.reduce((s, r) => s + Number(r.hours), 0);
  const oudeKost = regels.reduce((s, r) => s + Number(r.hours) * Number(r.hourly_cost_eur), 0);
  const nieuweKost = Math.round(uren * TARIEF * 100) / 100;

  // Veiligheidsklep: alleen rechtzetten als het tarief × uren écht het
  // subtotaal wordt. Wijkt dat af, dan klopt de aanname over deze factuur niet.
  if (nieuweKost !== Number(po.subtotal)) {
    throw new Error(
      `${uren} uur à ${eur(TARIEF)} is ${eur(nieuweKost)}, maar het subtotaal van de factuur is ${eur(Number(po.subtotal))} — gestopt.`,
    );
  }
  if (Math.abs(oudeKost - Number(po.total)) > 0.02) {
    console.log(`let op: de geboekte kost ${eur(oudeKost)} is niet gelijk aan het factuurtotaal ${eur(Number(po.total))}`);
  }

  console.log(`${po.reference} · ${eur(Number(po.total))} incl. btw = ${eur(Number(po.subtotal))} ex + ${eur(Number(po.tax))} btw\n`);
  for (const r of regels) {
    const oud = Number(r.hours) * Number(r.hourly_cost_eur);
    const nieuw = Math.round(Number(r.hours) * TARIEF * 100) / 100;
    console.log(
      `${String(r.project).padEnd(26)} ${Number(r.hours).toString().padStart(5)} u  ${eur(Number(r.hourly_cost_eur)).padStart(8)} → ${eur(TARIEF).padStart(7)}   ${eur(oud).padStart(9)} → ${eur(nieuw).padStart(9)}`,
    );
  }
  console.log(`${"".padEnd(26)} ${uren.toString().padStart(5)} u  ${"".padStart(8)}   ${"".padStart(7)}   ${eur(oudeKost).padStart(9)} → ${eur(nieuweKost).padStart(9)}`);

  await pgClient
    .begin(async (tx) => {
      await tx`
        update time_entries set hourly_cost_eur = ${TARIEF.toFixed(6)}, updated_at = now()
        where purchase_order_id = ${po.id} and self_logged_at is null`;

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${`Arbeidskost Wilhelmus ${REFERENTIE} teruggezet naar het tarief ex btw`},
        ${`De urenregels stonden op ${eur(32.67)} per uur — het incl.-btw-totaal gedeeld door ${uren} uur. Zijn tarief is ${eur(TARIEF)} ex btw, wat klopt met het subtotaal van de factuur. Arbeidskost op Showroom, Silvestre, Finca Lisa en Oliva Hotel samen: ${eur(oudeKost)} → ${eur(nieuweKost)}.`}
      )`;

      if (dry) throw new Error("__DRY__");
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "__DRY__") {
        console.log("\n[DRY RUN] teruggedraaid — er is niets gewijzigd.");
        return;
      }
      throw e;
    });

  if (!dry) {
    const na = (await pgClient`
      select pr.name as project, te.hours::text, te.hourly_cost_eur::text,
             round(te.hours * te.hourly_cost_eur, 2)::text as kost
      from time_entries te left join projects pr on pr.id = te.project_id
      where te.purchase_order_id = ${po.id} order by pr.name`) as unknown as Array<Record<string, string>>;
    let som = 0;
    console.log("\nresultaat:");
    for (const r of na) {
      som += Number(r.kost);
      console.log(`  ${String(r.project).padEnd(26)} ${Number(r.hours)} u à ${eur(Number(r.hourly_cost_eur))} = ${eur(Number(r.kost))}`);
    }
    console.log(`  ${"".padEnd(26)} samen ${eur(som)} ${som === Number(po.subtotal) ? "= subtotaal ex btw van de factuur" : "— WIJKT AF"}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
