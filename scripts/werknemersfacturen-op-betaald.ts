/**
 * Werknemers-/ploegfacturen op betaald zetten (verzoek Nick 19-08: "al die
 * inkoopfacturen van werknemers zijn ook gewoon betaald").
 *
 * Scope:
 *  1. alle onbetaalde inkooporders met count_as_labor = true (het systeem-
 *     kenmerk voor arbeid/uren);
 *  2. plus onbetaalde regels van werknemers die dat vlaggetje missen maar
 *     aantoonbaar loon/uren zijn: oude ahmed bouzekri-orders (A0003/4/7),
 *     "Hans van Dalen — Uren verantwoording", de losse Wilhelmus- en
 *     Pieter Hoogendijk-facturen.
 *
 * Bewust NIET: CSABAHOME (staat in workers maar de A186 van € 15.000 is niet
 * evident loon — eerst bevestigen), en alle "Pieter Hoogendijk / Hollandse
 * Meesters"-regels (materiaalaankopen via de winkel, geen loon).
 *
 * paid_eur = coalesce(bestaand, totaal); paid_at alleen vooruit.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!);
  try {
    const extra = await sql`
      select id, supplier, reference, total from purchase_orders
      where paid_at is null and count_as_labor is not true and (
        (supplier ilike 'ahmed bouzekri' and reference in ('A0003','A0004','A0007'))
        or (supplier = 'Hans van Dalen' and reference ilike 'Uren verantwoording%')
        or (supplier = 'Wilhelmus Mark Strijks')
        or (supplier = 'Pieter Hoogendijk' and reference ilike '%260050%')
      )`;
    const labor = await sql`
      select id, supplier, reference, total from purchase_orders
      where paid_at is null and count_as_labor = true`;

    const alle = [...labor, ...extra];
    let som = 0;
    for (const r of alle) {
      console.log(`BETAALD  ${String(r.supplier).slice(0, 34).padEnd(35)} ${String(r.reference ?? "").slice(0, 30).padEnd(31)} € ${String(r.total).padStart(9)}`);
      som += Number(r.total);
    }
    const ids = alle.map((r) => r.id);
    await sql`
      update purchase_orders set
        paid_eur = coalesce(paid_eur, total),
        paid_at = now(),
        updated_at = now()
      where id = any(${ids}) and paid_at is null`;
    console.log(`\n${alle.length} facturen op betaald gezet (samen € ${som.toFixed(2)}): ${labor.length} arbeid-gevlagd + ${extra.length} losse werknemersregels.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
