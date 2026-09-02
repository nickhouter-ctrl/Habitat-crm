/**
 * Factuur Pieter Hoogendijk 260065 opnieuw koppelen — 02-09-2026.
 *
 * Hij stond met drie posten van "1 uur" op de verkeerde werven: € 1.155 en
 * € 100 op de showroom, € 35 op Gata de Gorgos. Dat is het bedrag als tarief
 * geboekt in plaats van uren × tarief, en de showroom komt op zijn urenstaat
 * helemaal niet voor.
 *
 * De factuur zelf heeft drie regels:
 *   Diverse werkzaamheden, zie urenlijst 24 t/m 28 aug   1 × € 1.155,00
 *   vervoer Finestrat naar Javea en retour               5 × €    20,00 = € 100
 *   vervoer Javea naar Cata de Gorgos                    7 × €     5,00 = €  35
 *                                                                   ex btw € 1.290,00
 *
 * De urenstaat verdeelt die € 1.155 (38,5 uur à € 30) over kolommen per werf:
 *   24/08  6,5 u   Silvester 2 · cap. Negre 4                     (0,5 u zonder kolom)
 *   25/08  6   u   cap. Negre 6
 *   26/08 11,5 u   cata Gorg 11,5
 *   27/08  7,5 u   geen kolom — omschrijving: "Verhuizing kisten naar Cata de Gorgos"
 *   28/08  7   u   cap. Negre 7
 *
 * "cap. Negre" is Finca Lisa (dat is de werfnaam op zijn kaart), "Silvester"
 * is Silvestre en "cata Gorg" is Pand gata de gorgos.
 *
 * TWEE AANNAMES, want de staat zegt het niet met zoveel woorden:
 *  1. De 7,5 uur van 27/08 gaan naar Gata de Gorgos: de omschrijving is
 *     woordelijk dezelfde verhuizing als 26/08, waar de kolom wél is ingevuld.
 *  2. Het vervoer volgt de werf van die dag. Twee van de vijf ritten
 *     Finestrat–Javea vielen op de Gata-de-Gorgos-dagen (26 en 27 aug), de
 *     andere drie op Javea-dagen; die € 60 gaat naar rato van de uren naar
 *     Silvestre en Finca Lisa. De rit Javea–Cata de Gorgos is per factuurregel
 *     al aan Gata de Gorgos toegewezen.
 * De 0,5 uur die op 24/08 buiten de kolommen valt gaat naar Finca Lisa, de
 * werf waar die dag het meeste werk lag.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/hoogendijk-260065-koppelen.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const REFERENTIE = "Pieter Hoogendijk 260065";
const TARIEF = 30;
const DATUM = "2026-08-28"; // laatste werkdag op de urenstaat

const UREN: { project: string; uren: number; toelichting: string }[] = [
  { project: "Silvestre", uren: 2, toelichting: "24-08 instructie aanleg electra (kolom Silvester)" },
  {
    project: "Finca Lisa",
    uren: 17.5,
    toelichting:
      "24-08 4 u, 25-08 6 u en 28-08 7 u (kolom cap. Negre), plus de 0,5 u van 24-08 die buiten de kolommen viel",
  },
  {
    project: "Pand gata de gorgos",
    uren: 19,
    toelichting: "26-08 11,5 u (kolom cata Gorg) en 27-08 7,5 u — dezelfde verhuizing, kolom niet ingevuld",
  },
];

const VERVOER: { project: string; bedrag: number; toelichting: string }[] = [
  { project: "Pand gata de gorgos", bedrag: 75, toelichting: "rit Javea–Cata de Gorgos (7 × € 5) en 2 van de 5 ritten Finestrat–Javea, op 26 en 27 aug" },
  { project: "Finca Lisa", bedrag: 53.68, toelichting: "aandeel in de 3 ritten Finestrat–Javea van 24, 25 en 28 aug, naar rato van de uren" },
  { project: "Silvestre", bedrag: 6.32, toelichting: "aandeel in de 3 ritten Finestrat–Javea, naar rato van de uren" },
];

const eur = (n: number) => `€ ${n.toFixed(2)}`;

async function main() {
  const dry = process.argv.includes("--dry");

  const [po] = (await pgClient`
    select id, reference, total::text, subtotal::text, order_date::text, count_as_labor
    from purchase_orders where reference = ${REFERENTIE}`) as unknown as Array<Record<string, string>>;
  if (!po) throw new Error(`Factuur "${REFERENTIE}" niet gevonden — gestopt.`);

  const somUren = UREN.reduce((s, u) => s + u.uren, 0);
  const somArbeid = Math.round(somUren * TARIEF * 100) / 100;
  const somVervoer = Math.round(VERVOER.reduce((s, v) => s + v.bedrag, 0) * 100) / 100;
  const totaal = Math.round((somArbeid + somVervoer) * 100) / 100;

  if (somUren !== 38.5) throw new Error(`De uren tellen op tot ${somUren}, de staat zegt 38,5 — gestopt.`);
  if (totaal !== Number(po.subtotal)) {
    throw new Error(`Arbeid ${eur(somArbeid)} + vervoer ${eur(somVervoer)} = ${eur(totaal)}, de factuur is ${eur(Number(po.subtotal))} ex btw — gestopt.`);
  }

  const werven = new Map<string, string>();
  for (const naam of new Set([...UREN, ...VERVOER].map((r) => r.project))) {
    const [p] = (await pgClient`select id from projects where name = ${naam}`) as unknown as Array<{ id: string }>;
    if (!p) throw new Error(`Werf "${naam}" niet gevonden — gestopt.`);
    werven.set(naam, p.id);
  }

  console.log(`${po.reference} · ${eur(Number(po.total))} incl · ${eur(Number(po.subtotal))} ex btw\n`);
  console.log("uren (€ 30/u):");
  for (const u of UREN) console.log(`  ${u.project.padEnd(24)} ${String(u.uren).padStart(5)} u  ${eur(u.uren * TARIEF).padStart(9)}`);
  console.log(`  ${"".padEnd(24)} ${String(somUren).padStart(5)} u  ${eur(somArbeid).padStart(9)}`);
  console.log("\nvervoer:");
  for (const v of VERVOER) console.log(`  ${v.project.padEnd(24)} ${"".padStart(7)}  ${eur(v.bedrag).padStart(9)}`);
  console.log(`  ${"".padEnd(24)} ${"".padStart(7)}  ${eur(somVervoer).padStart(9)}`);
  console.log(`\n  samen ${eur(totaal)}`);

  await pgClient
    .begin(async (tx) => {
      // Alles wat deze koppeling eerder maakte eerst weg; portaal-uren blijven.
      await tx`delete from time_entries where purchase_order_id = ${po.id} and self_logged_at is null`;
      await tx`delete from project_costs where purchase_order_id = ${po.id}`;

      const [werker] = (await tx`
        select id, name from workers where name ilike ${"%hoogendijk%"}`) as unknown as Array<{ id: string; name: string }>;

      for (const u of UREN) {
        await tx`
          insert into time_entries
            (project_id, worker_id, worker_name, date, hours, hourly_cost_eur, payment_method, purchase_order_id, note)
          values
            (${werven.get(u.project)!}, ${werker?.id ?? null}, ${werker?.name ?? "Pieter Hoogendijk"},
             ${DATUM}, ${u.uren.toFixed(2)}, ${TARIEF.toFixed(6)}, ${"invoice"}, ${po.id},
             ${`Uren via inkoopfactuur ${REFERENTIE} — ${u.toelichting}`})`;
      }

      for (const v of VERVOER) {
        await tx`
          insert into project_costs (project_id, date, category, description, amount_eur, purchase_order_id)
          values (${werven.get(v.project)!}, ${DATUM}, ${"material"},
                  ${`Vervoer via inkoopfactuur ${REFERENTIE} — ${v.toelichting}`},
                  ${v.bedrag.toFixed(2)}, ${po.id})`;
      }

      // De inkooporder zelf blijft ongekoppeld: het bedrag zit al in de regels.
      await tx`update purchase_orders set project_id = null, count_as_labor = true, updated_at = now() where id = ${po.id}`;

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${`Verdeling ${REFERENTIE} rechtgezet volgens de urenstaat`},
        ${`Stond met drie posten van "1 uur" op de showroom en Gata de Gorgos — het bedrag als uurtarief geboekt. Nu volgens de urenstaat: ${UREN.map((u) => `${u.project} ${u.uren} u`).join(", ")} à ${eur(TARIEF)}, plus ${eur(somVervoer)} vervoer. Aannames: de 7,5 u van 27-08 horen bij Gata de Gorgos (zelfde verhuizing als 26-08) en het vervoer volgt de werf van die dag.`}
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
    const na = (await pgClient`
      select pr.name as project,
             coalesce(sum(te.hours), 0)::text as uren,
             round(coalesce(sum(te.hours * te.hourly_cost_eur), 0), 2)::text as arbeid
      from time_entries te join projects pr on pr.id = te.project_id
      where te.purchase_order_id = ${po.id} group by pr.name order by 3 desc`) as unknown as Array<Record<string, string>>;
    const kosten = (await pgClient`
      select pr.name as project, pc.amount_eur::text
      from project_costs pc join projects pr on pr.id = pc.project_id
      where pc.purchase_order_id = ${po.id} order by pc.amount_eur desc`) as unknown as Array<Record<string, string>>;
    let t = 0;
    for (const r of na) { t += Number(r.arbeid); console.log(`  ${String(r.project).padEnd(24)} ${Number(r.uren)} u  ${eur(Number(r.arbeid)).padStart(9)}`); }
    for (const r of kosten) { t += Number(r.amount_eur); console.log(`  ${String(r.project).padEnd(24)} vervoer ${eur(Number(r.amount_eur)).padStart(9)}`); }
    console.log(`  ${"".padEnd(24)} samen  ${eur(t)}  ${Math.abs(t - Number(po.subtotal)) < 0.01 ? "= de factuur ex btw" : "WIJKT AF"}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
