/**
 * Silvestre, 26-11-2026: de contante uren van Imad en Ahmed (16 regels,
 * 2.158,73 u) zijn op € 28 gezet zodat de klant € 28 + 15% opslag betaalt.
 * Echt betaald is € 20 contant. Dit zet `actual_hourly_cost_eur` = 20, zodat
 * "Eigen kosten" op de projectpagina laat zien wat we werkelijk kwijt zijn.
 *
 *   npx tsx scripts/silvestre-contant-werkelijk-20.ts          # alleen tonen
 *   npx tsx scripts/silvestre-contant-werkelijk-20.ts --write  # uitvoeren
 */
import postgres from "postgres";

const PROJECT = "4cb9735a-f50c-48c9-abf6-8321c5ddf95f"; // Silvestre
const WERKELIJK = "20";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

async function main() {
  const rows = await sql`
    select id, date, worker_name, hours, hourly_cost_eur, actual_hourly_cost_eur
    from time_entries
    where project_id = ${PROJECT} and payment_method = 'cash' and hourly_cost_eur = 28
    order by date`;
  const uren = rows.reduce((s, r) => s + Number(r.hours), 0);
  for (const r of rows) console.log(String(r.date).slice(0, 15), r.worker_name, r.hours, "u ×", Number(r.hourly_cost_eur), "→ werkelijk", r.actual_hourly_cost_eur ?? "—");
  console.log(`${rows.length} regels, ${uren.toFixed(2)} u · verschil ${(uren * 8).toFixed(2)} EUR`);
  if (rows.length !== 16) throw new Error(`Verwacht 16 regels, gevonden ${rows.length} — eerst nakijken.`);
  if (!process.argv.includes("--write")) return console.log("Dry-run. Met --write uitvoeren.");
  const r = await sql`update time_entries set actual_hourly_cost_eur = ${WERKELIJK}
    where id in ${sql(rows.map((x) => x.id as string))}`;
  console.log(`Bijgewerkt: ${r.count}`);
}
main().finally(() => sql.end());
