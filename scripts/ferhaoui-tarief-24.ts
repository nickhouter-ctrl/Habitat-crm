/**
 * Ferhaoui's uren herrekenen met € 24 in plaats van € 28 — 24-08-2026.
 *
 * Zijn ploegkaart stond op € 28 en dat was fout; het is € 24 ex btw. Al zijn
 * urenregels zijn uit een factuurbedrag teruggerekend met dat verkeerde tarief,
 * dus stond er te wéinig uur op de werf: € 4.750 gedeeld door 28 is 169,64 uur,
 * gedeeld door 24 is 197,92 uur.
 *
 * Het factuurbedrag blijft tot op de cent gelijk — dat is wat hij in rekening
 * bracht. Alleen de uren gaan omhoog, en het tarief krijgt zes decimalen zodat
 * uren × tarief exact het bedrag blijft.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/ferhaoui-tarief-24.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const OUD = 28;
const NIEUW = 24;

const eur = (n: number) => `€ ${n.toFixed(2)}`;

type Regel = { id: string; date: string; project: string | null; reference: string | null; hours: string; kost: string; note: string | null };

async function main() {
  const dry = process.argv.includes("--dry");

  const [kaart] = (await pgClient`
    select id, name, hourly_cost_eur::numeric::text as tarief from workers where name ilike ${"%ferhaoui%"}
  `) as unknown as Array<{ id: string; name: string; tarief: string }>;
  if (!kaart) throw new Error("Ploegkaart Ferhaoui niet gevonden — gestopt.");
  if (Number(kaart.tarief) !== NIEUW) {
    throw new Error(`Op zijn kaart staat ${kaart.tarief}, dit script rekent met ${NIEUW} — gestopt.`);
  }

  const regels = (await pgClient`
    select te.id, te.date::text, pr.name as project, po.reference,
           te.hours::text, round(te.hours*te.hourly_cost_eur,2)::text as kost, te.note
    from time_entries te
    left join projects pr on pr.id = te.project_id
    left join purchase_orders po on po.id = te.purchase_order_id
    where (te.worker_name ilike ${"%ferhaoui%"} or te.worker_id = ${kaart.id})
      and abs(te.hourly_cost_eur - ${OUD}) < 0.01
      and te.self_logged_at is null
    order by te.date`) as unknown as Regel[];

  if (regels.length === 0) {
    console.log("Geen urenregels meer op het oude tarief — niets te doen.");
    await pgClient.end();
    process.exit(0);
  }

  console.log(`${regels.length} urenregels van ${kaart.name}: € ${OUD} → € ${NIEUW} per uur\n`);
  let somOud = 0;
  let somNieuw = 0;
  for (const r of regels) {
    const kost = Number(r.kost);
    const uren = Math.round((kost / NIEUW) * 100) / 100;
    somOud += Number(r.hours);
    somNieuw += uren;
    console.log(
      `  ${r.date}  ${String(r.reference ?? r.project).padEnd(28)} ${eur(kost).padStart(10)}   ${Number(r.hours).toFixed(2).padStart(7)} u → ${uren.toFixed(2).padStart(7)} u`,
    );
  }
  console.log(`  ${"".padEnd(30)} ${"".padStart(10)}   ${somOud.toFixed(2).padStart(7)} u → ${somNieuw.toFixed(2).padStart(7)} u`);

  await pgClient
    .begin(async (tx) => {
      for (const r of regels) {
        const kost = Number(r.kost);
        const uren = Math.round((kost / NIEUW) * 100) / 100;
        const tarief = kost / uren; // zes decimalen: de kost blijft exact
        await tx`
          update time_entries set
            hours = ${uren.toFixed(2)},
            hourly_cost_eur = ${tarief.toFixed(6)},
            worker_id = ${kaart.id},
            worker_name = ${kaart.name},
            note = ${(r.note ?? "").replace(/€ ?28\/u/g, `€ ${NIEUW}/u`) || null},
            updated_at = now()
          where id = ${r.id}`;
      }

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${`Uren ${kaart.name} herrekend met € ${NIEUW} per uur`},
        ${`Zijn tarief stond op € ${OUD} en dat was fout. Alle ${regels.length} urenregels waren uit het factuurbedrag teruggerekend met dat tarief, dus stond er te weinig uur op de werven: ${somOud.toFixed(2)} → ${somNieuw.toFixed(2)} uur. De factuurbedragen blijven ongewijzigd (${eur(regels.reduce((s, r) => s + Number(r.kost), 0))}).`}
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
      select round(sum(te.hours),2)::text uren, round(sum(te.hours*te.hourly_cost_eur),2)::text kost
      from time_entries te where te.worker_id = ${kaart.id}`) as unknown as Array<Record<string, string>>;
    console.log(`\nresultaat: ${Number(na[0].uren)} uur · ${eur(Number(na[0].kost))} arbeidskost`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
