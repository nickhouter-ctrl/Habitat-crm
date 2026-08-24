/**
 * Imad terugzetten op contant — 24-08-2026.
 *
 * Ik verschoof zeven van zijn urenregels (Finca Lisa, € 10.640) naar "per
 * factuur" omdat ze niet op zijn kasoverzicht stonden. Fout: die regels zijn
 * met de hand ingevoerd en niet uit een factuur ontstaan, en wat er met de hand
 * op contant is gezet klopte gewoon. Dat het kasoverzicht ze niet noemt betekent
 * alleen dat die lijst niet alles dekt.
 *
 * De notities krijgen hun "Contant"-voorvoegsel terug; ik had dat weggehaald
 * omdat het de kaslijst leek tegen te spreken.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/imad-terug-naar-contant.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const IMAD = "74f2690a-0235-4c1d-b9b4-d87de3c26c5a";

/** De notities zoals ze waren, per datum. */
const NOTITIES: Record<string, string> = {
  "2026-05-16": "Contant — kas storting (datum ontbrak op opgave)",
  "2026-05-20": "Contant — uren 16-17 mei / 18 t/m 23 mei 2026",
  "2026-05-28": "Contant — uren 16-17 mei / 18 t/m 23 mei 2026",
  "2026-05-30": "Contant — uren 25-05 t/m 30-05-2026",
  "2026-06-11": "Contant — uren 01-06 t/m 06-06-2026",
  "2026-06-15": "Contant — uren 08-06 t/m 13-06-2026",
};

const eur = (n: number) => `€ ${n.toFixed(2)}`;

async function main() {
  const dry = process.argv.includes("--dry");

  const regels = (await pgClient`
    select te.id, te.date::text, pr.name as project,
           round(te.hours*te.hourly_cost_eur,2)::text as kost, te.payment_method, te.note,
           te.purchase_order_id
    from time_entries te left join projects pr on pr.id = te.project_id
    where te.worker_id = ${IMAD} and te.payment_method = 'invoice'
    order by te.date`) as unknown as Array<Record<string, string | null>>;

  if (regels.length === 0) {
    console.log("Imad staat al volledig op contant — niets te doen.");
    await pgClient.end();
    process.exit(0);
  }

  // Veiligheidsklep: alleen met de hand ingevoerde regels terugzetten. Hangt er
  // toch een factuur aan, dan is het een ander geval en stoppen we.
  const uitFactuur = regels.filter((r) => r.purchase_order_id);
  if (uitFactuur.length > 0) {
    throw new Error(`${uitFactuur.length} van deze regels komt uit een factuur — met de hand bekijken, niets gewijzigd.`);
  }

  console.log(`terug naar contant: ${regels.length} regels (${eur(regels.reduce((s, r) => s + Number(r.kost), 0))})`);
  for (const r of regels) {
    const herstel = NOTITIES[String(r.date)];
    console.log(`  ${r.date}  ${String(r.project).padEnd(14)} ${eur(Number(r.kost)).padStart(10)}${herstel ? `  notitie → "${herstel}"` : ""}`);
  }

  await pgClient
    .begin(async (tx) => {
      await tx`update time_entries set payment_method = 'cash', updated_at = now()
               where id in ${tx(regels.map((r) => r.id as string))}`;
      for (const [datum, notitie] of Object.entries(NOTITIES)) {
        await tx`update time_entries set note = ${notitie}, updated_at = now()
                 where worker_id = ${IMAD} and date = ${datum} and note is distinct from ${notitie}
                   and purchase_order_id is null`;
      }
      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${"Imad weer volledig op contant"},
        ${`Zeven urenregels waren op grond van het kasoverzicht naar "per factuur" gezet. Ze zijn met de hand ingevoerd en niet uit een factuur ontstaan, en handmatig op contant gezette regels kloppen. Teruggedraaid (${eur(regels.reduce((s, r) => s + Number(r.kost), 0))}) en de notities hersteld.`}
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
    console.log("\nresultaat:");
    console.table(await pgClient`
      select te.payment_method, count(*)::int n, round(sum(te.hours*te.hourly_cost_eur),2)::text kost
      from time_entries te where te.worker_id = ${IMAD} group by te.payment_method`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
