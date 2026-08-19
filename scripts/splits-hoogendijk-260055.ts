/**
 * Splitst de urenfactuur van Pieter Hoogendijk (260055) per project — 19-08-2026.
 *
 * De factuur van € 1.324,95 bestrijkt drie klussen; een inkooporder kan er maar
 * één dragen. Volgens de urenverantwoording bij de factuur (weken 11 t/m 14
 * augustus, alles à € 30/uur en vervoer à € 20/uur):
 *
 *   Showroom    13 aug 9 u € 270 + 14 aug 7,5 u € 225                = € 495
 *   Oliva Hotel 12 aug 7 u € 210 + hotel-transport € 40 + vervoer € 80 = € 330
 *   Finca Lisa  11 aug 6 u € 180 + 2 u € 60 + 12 aug 1 u € 30         = € 270
 *                                                                    ────────
 *                                                                    € 1.095
 *
 * Btw is precies 21% per regel, dus de delen tellen exact op tot € 1.324,95 —
 * geen afrondingsrest te verdelen.
 *
 * Het grootste deel hergebruikt de bestaande inkooporder, zodat de gekoppelde
 * mail en de bijlage blijven hangen waar ze horen; de twee kleinere komen er
 * als aparte regel bij. Alle drie als ARBEID geboekt: het zijn uren, geen
 * materiaal, en dat is wat de projectmarge nodig heeft.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/splits-hoogendijk-260055.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const PO_ID = "3e19b8c0-dca6-4bdf-9995-42cd7f87c57e";

const DELEN = [
  {
    project: "f0e3129a-605b-4155-939e-4b8784a7bd88",
    naam: "Showroom & kantoor Donny",
    exBtw: 495,
    uren: 16.5,
    toelichting: "13 aug 9 u en 14 aug 7,5 u — 'Pieter Habitat One'",
    grootste: true,
  },
  {
    project: "9477a9ff-d421-4b23-a7fd-3b8a42d99c73",
    naam: "Oliva Hotel",
    exBtw: 330,
    uren: 13,
    toelichting: "12 aug 7 u 'Habitat one Oliva', plus hotel-transport 2 u en vervoer 11-14 aug 4 u",
    grootste: false,
  },
  {
    project: "7b06cf54-d07e-420e-aa6a-bb6e85628e0a",
    naam: "Finca Lisa",
    exBtw: 270,
    uren: 9,
    toelichting: "11 aug 6 u en 2 u, 12 aug 1 u — 'Pieter lisette'",
    grootste: false,
  },
];

const eur = (n: number) => `€ ${n.toFixed(2)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Po = {
  id: string;
  supplier: string;
  reference: string | null;
  total: string;
  order_date: string | null;
  due_date: string | null;
  received_at: string | null;
  status: string;
  kind: string;
  currency: string;
  notes: string | null;
  attachments: unknown;
};

async function main() {
  const dry = process.argv.includes("--dry");

  const [po] = (await pgClient`
    select id, supplier, reference, total, order_date, due_date, received_at, status, kind, currency, notes, attachments
    from purchase_orders where id = ${PO_ID}
  `) as unknown as Po[];
  if (!po) throw new Error("Inkooporder niet gevonden — mogelijk al gesplitst.");

  const somEx = DELEN.reduce((s, d) => s + d.exBtw, 0);
  const somIncl = r2(DELEN.reduce((s, d) => s + d.exBtw * 1.21, 0));
  if (somIncl !== Number(po.total)) {
    throw new Error(`De delen tellen op tot ${eur(somIncl)}, de factuur is ${eur(Number(po.total))} — gestopt.`);
  }
  console.log(`${po.supplier} · ${eur(Number(po.total))} incl. btw (${eur(somEx)} ex)\n`);

  await pgClient
    .begin(async (tx) => {
      for (const d of DELEN) {
        const btw = r2(d.exBtw * 0.21);
        const incl = r2(d.exBtw + btw);
        const ref = `Hoogendijk 260055 — ${d.naam}`;
        const notitie =
          `${po.notes ?? ""}\n\nGesplitst 19-08-2026 per project volgens de urenverantwoording bij de factuur. ` +
          `Dit deel: ${d.naam} — ${d.uren} uur, ${eur(d.exBtw)} ex btw. ${d.toelichting}.`.trim();
        const regels = JSON.stringify([
          { name: `Uren ${d.naam} (${d.uren} u)`, units: 1, unitPrice: d.exBtw, note: d.toelichting },
        ]);

        console.log(`${d.naam.padEnd(26)} ${d.uren.toString().padStart(5)} u  ${eur(d.exBtw).padStart(10)} ex + ${eur(btw).padStart(8)} btw = ${eur(incl).padStart(10)}`);
        if (dry) continue;

        if (d.grootste) {
          await tx`
            update purchase_orders set
              reference = ${ref}, project_id = ${d.project}, count_as_labor = true,
              total = ${incl.toFixed(2)}, subtotal = ${d.exBtw.toFixed(2)}, tax = ${btw.toFixed(2)},
              items = ${regels}::jsonb, notes = ${notitie}, updated_at = now()
            where id = ${po.id}`;
        } else {
          await tx`
            insert into purchase_orders
              (supplier, reference, status, kind, currency, order_date, due_date, received_at,
               total, subtotal, tax, project_id, count_as_labor, items, attachments, notes, stock_applied_at)
            values
              (${po.supplier}, ${ref}, ${po.status}, ${po.kind}, ${po.currency},
               ${po.order_date}, ${po.due_date}, ${po.received_at},
               ${incl.toFixed(2)}, ${d.exBtw.toFixed(2)}, ${btw.toFixed(2)},
               ${d.project}, true, ${regels}::jsonb,
               ${JSON.stringify(Array.isArray(po.attachments) ? po.attachments : [])}::jsonb,
               ${notitie}, now())`;
        }
      }

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${"Urenfactuur Hoogendijk 260055 gesplitst over drie projecten"},
        ${`${eur(Number(po.total))} verdeeld volgens de urenverantwoording: ${DELEN.map((d) => `${d.naam} ${eur(r2(d.exBtw * 1.21))}`).join(", ")}. Alle drie als arbeid geboekt.`}
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
    const na = await pgClient`
      select po.reference, po.total, po.subtotal, po.tax, po.count_as_labor, pr.name as project
      from purchase_orders po left join projects pr on pr.id = po.project_id
      where po.reference like ${"Hoogendijk 260055%"} order by po.total desc`;
    console.log("\nresultaat:");
    let som = 0;
    for (const x of na as unknown as Array<Record<string, string>>) {
      som += Number(x.total);
      console.log(`  ${String(x.project).padEnd(26)} ${eur(Number(x.total)).padStart(10)} (ex ${x.subtotal} + btw ${x.tax}) arbeid=${x.count_as_labor}`);
    }
    console.log(`  ${"".padEnd(26)} ${eur(som).padStart(10)}  ${som === Number(po.total) ? "gelijk aan het origineel" : "WIJKT AF"}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
