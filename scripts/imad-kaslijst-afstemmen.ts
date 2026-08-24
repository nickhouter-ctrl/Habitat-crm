/**
 * De kaslijst van imad naast zijn urenregels leggen — 24-08-2026.
 *
 * Nick's eigen kasoverzicht ("IMAD cash") telt op tot € 37.454,50 over 15
 * betalingen tussen 21-03 en 23-06. Dat is tot op tien cent het Silvestre-deel
 * van zijn urenregels in het systeem (€ 37.454,60) — datum voor datum en bedrag
 * voor bedrag. Zijn Finca Lisa-regels (7 stuks, € 10.640) staan NIET op die
 * lijst en zijn dus niet contant afgerekend.
 *
 * De notities bij die Finca Lisa-regels zeggen wel "Contant"; die tekst komt uit
 * een eerdere import en klopt dus niet. De kaslijst is de bron.
 *
 * Alleen de betaalwijze gaat om. Het uurtarief blijft € 20: dat is wat er
 * geboekt is, en of er per factuur een ander tarief gold valt hier niet uit af
 * te leiden.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/imad-kaslijst-afstemmen.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const IMAD = "74f2690a-0235-4c1d-b9b4-d87de3c26c5a";

/** De kaslijst zoals aangeleverd: datum + bedrag. */
const KASLIJST: Array<[string, number]> = [
  ["2026-03-21", 1350], ["2026-03-26", 1000], ["2026-03-31", 1000], ["2025-04-10", 2500],
  ["2026-04-13", 5000], ["2026-04-21", 5000], ["2026-05-02", 4724.5], ["2026-05-09", 3000],
  ["2026-05-12", 1000], ["2026-05-26", 2000], ["2026-05-28", 2000], ["2026-06-02", 2360],
  ["2026-06-10", 2480], ["2026-06-16", 3120], ["2026-06-23", 920],
];

const eur = (n: number) => `€ ${n.toFixed(2)}`;

type Regel = { id: string; project: string; date: string; kost: string; payment_method: string; note: string | null };

async function main() {
  const dry = process.argv.includes("--dry");

  const regels = (await pgClient`
    select te.id, coalesce(pr.name,'—') as project, te.date::text,
           round(te.hours*te.hourly_cost_eur,2)::text as kost, te.payment_method, te.note
    from time_entries te left join projects pr on pr.id = te.project_id
    where te.worker_id = ${IMAD} order by te.date`) as unknown as Regel[];

  // Elke kasregel aan één urenregel koppelen op datum + bedrag.
  const nogVrij = [...regels];
  const contantIds = new Set<string>();
  const nietGevonden: Array<[string, number]> = [];
  for (const [datum, bedrag] of KASLIJST) {
    const i = nogVrij.findIndex((r) => r.date === datum && Math.abs(Number(r.kost) - bedrag) <= 0.2);
    if (i === -1) {
      nietGevonden.push([datum, bedrag]);
      continue;
    }
    contantIds.add(nogVrij[i].id);
    nogVrij.splice(i, 1);
  }

  console.log(`kaslijst: ${KASLIJST.length} betalingen, samen ${eur(KASLIJST.reduce((s, k) => s + k[1], 0))}`);
  console.log(`gevonden in de urenregels: ${contantIds.size}`);
  if (nietGevonden.length) {
    console.log("NIET teruggevonden:");
    for (const [d, b] of nietGevonden) console.log(`  ${d}  ${eur(b)}`);
  }

  const rest = regels.filter((r) => !contantIds.has(r.id));
  console.log(`\nniet op de kaslijst → per factuur (${rest.length} regels, ${eur(rest.reduce((s, r) => s + Number(r.kost), 0))}):`);
  for (const r of rest) {
    console.log(`  ${r.date}  ${r.project.padEnd(14)} ${eur(Number(r.kost)).padStart(10)}  nu: ${r.payment_method}${r.note ? `  · "${r.note}"` : ""}`);
  }

  // Veiligheidsklep: elke kasregel moet terug te vinden zijn, anders klopt de
  // aanname over deze lijst niet en mag er niets omgezet worden.
  if (nietGevonden.length > 0) {
    throw new Error(`${nietGevonden.length} kasbetaling(en) niet teruggevonden — met de hand bekijken, niets gewijzigd.`);
  }

  await pgClient
    .begin(async (tx) => {
      await tx`update time_entries set payment_method = 'cash', updated_at = now()
               where id in ${tx([...contantIds])}`;
      if (rest.length > 0) {
        await tx`update time_entries set payment_method = 'invoice', updated_at = now()
                 where id in ${tx(rest.map((r) => r.id))}`;
        // De notitie zegt bij zes van deze regels "Contant"; dat komt uit een
        // eerdere import en spreekt de kaslijst tegen. Het voorvoegsel eraf,
        // de periode blijft staan — anders leest de volgende die tekst weer als
        // bewijs dat het contant ging.
        await tx`
          update time_entries
          set note = nullif(trim(regexp_replace(note, '^Contant( betaald)?\s*(—|-)?\s*', '')), ''),
              updated_at = now()
          where id in ${tx(rest.map((r) => r.id))} and note ilike 'Contant%'`;
      }
      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${"Betaalwijze imad afgestemd op de kaslijst"},
        ${`De kaslijst "IMAD cash" (${KASLIJST.length} betalingen, ${eur(KASLIJST.reduce((s, k) => s + k[1], 0))}) is regel voor regel teruggevonden in zijn urenregels — dat zijn de Silvestre-regels. De ${rest.length} regels die er niet op staan (${eur(rest.reduce((s, r) => s + Number(r.kost), 0))}, Finca Lisa) staan nu op per factuur. Hun notitie zegt nog "Contant"; die tekst komt uit een eerdere import.`}
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
