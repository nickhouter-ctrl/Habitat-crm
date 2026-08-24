/**
 * De vier mannen van Zerghini onder zijn eigen naam brengen — 24-08-2026.
 *
 * Zijn factura nº 2 (10-07, € 3.016 ex btw, Het palijsje) heeft een urenstaat
 * met vier man erop: Hicham 32 u, Anwar 32 u, Morad 30 u, Bilal 22 u, samen
 * 116 uur à € 26 — precies het factuurbedrag. Die zijn destijds per man als
 * urenregel ingeboekt, elk met alleen een naam en geen ploegkaart.
 *
 * Het is zijn ploeg en zijn factuur, dus de uren horen bij hem. Ze krijgen zijn
 * worker_id; wie het werk deed blijft in de notitie staan, want dat is precies
 * wat de urenstaat waard maakt.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/zerghini-ploeguren-koppelen.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const MANNEN = ["Anwar", "Bilal", "Hicham", "Morad"];

const eur = (n: number) => `€ ${n.toFixed(2)}`;

async function main() {
  const dry = process.argv.includes("--dry");

  const [zerghini] = (await pgClient`
    select id, name, hourly_cost_eur::numeric::text as tarief from workers where name ilike ${"%zerghini%"}
  `) as unknown as Array<{ id: string; name: string; tarief: string }>;
  if (!zerghini) throw new Error("Ploegkaart Zerghini niet gevonden — gestopt.");

  const regels = (await pgClient`
    select te.id, te.worker_name, te.date::text, pr.name as project, te.hours::text,
           te.hourly_cost_eur::numeric::text as tarief,
           round(te.hours*te.hourly_cost_eur,2)::text as kost, te.note, po.reference
    from time_entries te
    left join projects pr on pr.id = te.project_id
    left join purchase_orders po on po.id = te.purchase_order_id
    where te.worker_name in ${pgClient(MANNEN)} and te.worker_id is null
    order by te.worker_name`) as unknown as Array<Record<string, string | null>>;

  if (regels.length === 0) {
    console.log("Geen losse regels meer op die namen — niets te doen.");
    await pgClient.end();
    process.exit(0);
  }

  const uren = regels.reduce((s, r) => s + Number(r.hours), 0);
  const kost = regels.reduce((s, r) => s + Number(r.kost), 0);
  console.log(`${regels.length} regels → ${zerghini.name} (kaart € ${zerghini.tarief}/u)\n`);
  for (const r of regels) {
    console.log(`  ${String(r.worker_name).padEnd(8)} ${Number(r.hours).toString().padStart(5)} u à € ${r.tarief}  ${eur(Number(r.kost)).padStart(9)}  ${r.reference}`);
  }
  console.log(`  ${"".padEnd(8)} ${uren.toString().padStart(5)} u  ${"".padStart(9)} ${eur(kost).padStart(9)}`);

  await pgClient
    .begin(async (tx) => {
      for (const r of regels) {
        // Wie het werk deed blijft vooraan in de notitie staan; de bestaande
        // tekst blijft er achter hangen zodat de urenstaat vindbaar blijft.
        const notitie = `${r.worker_name} — ${r.note ?? `urenstaat bij ${r.reference ?? "de factuur"}`}`
          .replace(/ — Week /, " — week ");
        await tx`
          update time_entries set
            worker_id = ${zerghini.id},
            worker_name = ${zerghini.name},
            note = ${notitie},
            updated_at = now()
          where id = ${r.id}`;
      }

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${`Ploeguren van ${zerghini.name} onder zijn eigen naam gebracht`},
        ${`De urenstaat bij zijn factura nº 2 noemt vier man (${MANNEN.join(", ")}), samen ${uren} uur / ${eur(kost)}. Die stonden als losse namen zonder ploegkaart en telden daardoor op geen enkele ploegpagina mee. Ze horen bij zijn eigen ploeg, dus hangen ze nu aan zijn kaart; wie het werk deed staat in de notitie van elke regel.`}
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
      from time_entries te where te.worker_id = ${zerghini.id}`) as unknown as Array<Record<string, string>>;
    console.log(`\nresultaat: ${zerghini.name} staat op ${Number(na[0].uren)} uur · ${eur(Number(na[0].kost))}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
