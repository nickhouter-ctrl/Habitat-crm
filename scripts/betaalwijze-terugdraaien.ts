/**
 * Mijn te brede ingreep van vandaag terugdraaien — 24-08-2026.
 *
 * Ik zette álle urenregels die aan een inkoopfactuur hangen op "per factuur",
 * met als redenering: hangt aan een factuur, dus per factuur betaald. Dat klopt
 * niet. De betaalwijze zegt hoe het geld is gegaan, niet waar de regel vandaan
 * komt — een factuur kun je contant afrekenen, en zo is het bij Ahmed en imad
 * ook gegaan.
 *
 * Wat Nick zegt: het stond allemaal goed, behalve de regels die er vandaag bij
 * zijn gekomen. Dus alles wat vóór vandaag is aangemaakt gaat terug naar
 * contant; de regels van vandaag (Wilhelmus 0-03 en 0-05, Ahmed A0031/A0032)
 * blijven per factuur staan.
 *
 * De btw-correctie op 0-05 blijft: die ging over de kostprijs, niet over de
 * betaalwijze.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/betaalwijze-terugdraaien.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

/** Vanaf wanneer een urenregel "nieuw" is — alles daarvoor stond al goed. */
const NIEUW_VANAF = "2026-08-24";

const eur = (n: number) => `€ ${n.toFixed(2)}`;

async function main() {
  const dry = process.argv.includes("--dry");

  const terug = (await pgClient`
    select te.id, te.worker_name, pr.name as project, te.date::text,
           round(te.hours*te.hourly_cost_eur,2)::text as kost, po.reference,
           te.created_at::date::text as aangemaakt
    from time_entries te
    join purchase_orders po on po.id = te.purchase_order_id
    left join projects pr on pr.id = te.project_id
    where te.payment_method = 'invoice'
      and te.self_logged_at is null
      and te.updated_at > now() - interval '2 hours'
      and te.created_at::date < ${NIEUW_VANAF}
    order by te.worker_name, te.date`) as unknown as Array<Record<string, string>>;

  const blijft = (await pgClient`
    select te.worker_name, po.reference, count(*)::int n,
           round(sum(te.hours*te.hourly_cost_eur),2)::text as kost
    from time_entries te
    join purchase_orders po on po.id = te.purchase_order_id
    where te.payment_method = 'invoice' and te.created_at::date >= ${NIEUW_VANAF}
    group by te.worker_name, po.reference order by te.worker_name`) as unknown as Array<Record<string, string>>;

  console.log(`terug naar contant: ${terug.length} regels (${eur(terug.reduce((s, r) => s + Number(r.kost), 0))})`);
  const perArbeider = new Map<string, { n: number; kost: number }>();
  for (const r of terug) {
    const k = String(r.worker_name);
    const v = perArbeider.get(k) ?? { n: 0, kost: 0 };
    perArbeider.set(k, { n: v.n + 1, kost: v.kost + Number(r.kost) });
  }
  for (const [naam, v] of perArbeider) console.log(`  ${naam.padEnd(26)} ${String(v.n).padStart(3)} regels  ${eur(v.kost)}`);

  console.log(`\nblijft per factuur (vandaag aangemaakt):`);
  for (const b of blijft) console.log(`  ${String(b.worker_name).padEnd(26)} ${String(b.reference).padEnd(30)} ${b.n} regels  ${eur(Number(b.kost))}`);

  if (terug.length === 0) {
    console.log("\nNiets terug te draaien.");
    await pgClient.end();
    process.exit(0);
  }

  await pgClient
    .begin(async (tx) => {
      await tx`
        update time_entries set payment_method = 'cash', updated_at = now()
        where id in ${tx(terug.map((r) => r.id))}`;

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${"Betaalwijze urenregels teruggedraaid naar contant"},
        ${`${terug.length} urenregels waren vandaag ten onrechte op "per factuur" gezet op grond van "hangt aan een factuur". Een factuur kan contant afgerekend worden, dus dat is geen bewijs. Alles wat vóór ${NIEUW_VANAF} was aangemaakt stond al goed en staat weer op contant (${eur(terug.reduce((s, r) => s + Number(r.kost), 0))}); alleen de regels van vandaag blijven per factuur.`}
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
    console.log("\nresultaat — urenregels uit een factuur:");
    console.table(
      await pgClient`
        select te.payment_method, count(*)::int n, round(sum(te.hours*te.hourly_cost_eur),2)::text kost
        from time_entries te where te.purchase_order_id is not null group by te.payment_method`,
    );
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
