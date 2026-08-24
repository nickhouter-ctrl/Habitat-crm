/**
 * Factuur N° 4 van Wilhelmus Mark Strijks rechtzetten — 24-08-2026.
 *
 * De mail "Fwd: FACTURA Y JUSTIFICANTE N° 4 WILHELMUS" bevat twee bijlagen: de
 * factuur zelf (0-04, € 1.471,50 + € 309,01 = € 1.780,51) en de
 * urenverantwoording (FAC_25009, dezelfde € 1.471,50 maar dan zonder btw).
 * Beide zijn door de keurpoort gegaan, dus dezelfde factuur staat er twee keer
 * in — en is ook twee keer als betaald geregistreerd (€ 3.252,01 in plaats van
 * € 1.780,51). De urenregistratie is geen tweede factuur: die verdwijnt, de
 * factuur blijft, en de bijlagen van beide gaan mee naar de blijver.
 *
 * Daarna wordt de factuur over zes projecten gesplitst zoals Nick hem in Holded
 * heeft ingedeeld — 54,5 uur à € 27 ex btw:
 *
 *   Showroom & kantoor Donny   15   u   € 405,00
 *   Silvestre                  12   u   € 324,00
 *   Pand gata de gorgos         8   u   € 216,00
 *   Oliva Hotel                 7   u   € 189,00
 *   Het palijsje (Gershwin)     6,5 u   € 175,50
 *   Finca Lisa                  6   u   € 162,00
 *                             ─────    ─────────
 *                              54,5 u  € 1.471,50
 *
 * Per regel 21% btw geeft € 309,02; de factuur zelf zegt € 309,01. Die cent gaat
 * van 't Palijsje af — de enige regel die op een halve cent uitkomt (36,855) en
 * dus de enige waar afronden een keuze is. Zo telt de som exact op tot het
 * factuurbedrag.
 *
 * Elk deel krijgt ook een UREN-regel. Een inkooporder met `count_as_labor` telt
 * namelijk niet als materiaal (anders dubbel) — zonder urenregel landt de kost
 * dus nergens. Tarief € 27 ex btw, gelijk aan het tarief op zijn arbeiderskaart.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/wilhelmus-0-04-splitsen.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

/** De factuur zelf — blijft staan en wordt het grootste deel (showroom). */
const HOUD = "f2eaf727-dac0-48f3-878c-2994d6445763";
/** De urenverantwoording, per ongeluk als tweede factuur geboekt. */
const WEG = "1773982b-08a1-42ed-be03-60cb755df5e7";

const WORKER = "19d6a034-bbb4-4a15-82d2-a849d614ee5b"; // Wilhelmus Strijks, € 27/u
const TARIEF = 27;
const WERKDATUM = "2026-08-08"; // factuurdatum; de uren lopen 27-07 t/m 05-08

type Deel = {
  project: string;
  naam: string;
  uren: number;
  btw: number;
  werk: string;
  grootste?: boolean;
};

const DELEN: Deel[] = [
  {
    project: "f0e3129a-605b-4155-939e-4b8784a7bd88",
    naam: "Showroom & kantoor Donny",
    uren: 15,
    btw: 85.05,
    werk: "kranen en wc-frames gezocht, ledverlichting in de trap geplaatst en afgestukt, trapstucwerk voorbereid",
    grootste: true,
  },
  {
    project: "4cb9735a-f50c-48c9-abf6-8321c5ddf95f",
    naam: "Silvestre",
    uren: 12,
    btw: 68.04,
    werk: "materialen gekocht en de bouw gecontroleerd (27-07 t/m 04-08)",
  },
  {
    project: "8d5ad3c3-ca8d-400d-a8a2-4869363c5739",
    naam: "Pand gata de gorgos",
    uren: 8,
    btw: 45.36,
    werk: "backboard opgehaald en weggebracht, div. werkzaamheden",
  },
  {
    project: "9477a9ff-d421-4b23-a7fd-3b8a42d99c73",
    naam: "Oliva Hotel",
    uren: 7,
    btw: 39.69,
    werk: "deurposten uitgezocht, van de stellingen gehaald en naar Oliva gebracht",
  },
  {
    project: "e684ff29-6e36-42a3-b7bd-8aaf2c4d322a",
    naam: "Het palijsje (Gershwin)",
    uren: 6.5,
    btw: 36.85, // 36,855 naar beneden: hier valt de cent die de factuur niet heeft
    werk: "controle en diverse werkzaamheden",
  },
  {
    project: "7b06cf54-d07e-420e-aa6a-bb6e85628e0a",
    naam: "Finca Lisa",
    uren: 6,
    btw: 34.02,
    werk: "controle diverse werkzaamheden, o.a. septictank",
  },
];

const eur = (n: number) => `€ ${n.toFixed(2)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const ex = (d: Deel) => r2(d.uren * TARIEF);
const incl = (d: Deel) => r2(ex(d) + d.btw);

type Po = {
  id: string;
  supplier: string;
  reference: string | null;
  total: string;
  subtotal: string | null;
  tax: string | null;
  order_date: string | null;
  due_date: string | null;
  received_at: string | null;
  paid_at: string | null;
  status: string;
  kind: string;
  currency: string;
  notes: string | null;
  attachments: unknown[] | null;
  holded_id: string | null;
};

async function main() {
  const dry = process.argv.includes("--dry");

  const rijen = (await pgClient`
    select id, supplier, reference, total, subtotal, tax, order_date, due_date, received_at,
           paid_at, status, kind, currency, notes, attachments, holded_id
    from purchase_orders where id in (${HOUD}, ${WEG})
  `) as unknown as Po[];
  const houd = rijen.find((r) => r.id === HOUD);
  const weg = rijen.find((r) => r.id === WEG);
  if (!houd) throw new Error("Factuur 0-04 niet gevonden — mogelijk al gesplitst.");

  // Veiligheidsklep: alleen splitsen als de factuur er nog ongewijzigd bij ligt.
  if (Number(houd.total) !== 1780.51 || Number(houd.subtotal) !== 1471.5) {
    throw new Error(`0-04 staat op ${eur(Number(houd.total))} (ex ${eur(Number(houd.subtotal))}) — verwacht € 1.780,51 / € 1.471,50. Gestopt.`);
  }
  if (houd.holded_id) throw new Error("0-04 hangt aan Holded — niet splitsen zonder daar ook te kijken.");

  const somEx = r2(DELEN.reduce((s, d) => s + ex(d), 0));
  const somBtw = r2(DELEN.reduce((s, d) => s + d.btw, 0));
  const somIncl = r2(DELEN.reduce((s, d) => s + incl(d), 0));
  const somUren = DELEN.reduce((s, d) => s + d.uren, 0);
  if (somEx !== Number(houd.subtotal) || somBtw !== Number(houd.tax) || somIncl !== Number(houd.total)) {
    throw new Error(
      `De delen tellen op tot ${eur(somEx)} + ${eur(somBtw)} = ${eur(somIncl)}, ` +
        `de factuur is ${eur(Number(houd.subtotal))} + ${eur(Number(houd.tax))} = ${eur(Number(houd.total))} — gestopt.`,
    );
  }
  console.log(`${houd.supplier} · factuur 0-04 · ${eur(Number(houd.total))} incl. btw`);
  console.log(`${somUren} uur à ${eur(TARIEF)} ex btw over ${DELEN.length} projecten\n`);

  const bijlagen = (b: unknown): unknown[] => (Array.isArray(b) ? b : []);
  const samengevoegd = (() => {
    const h = bijlagen(houd.attachments);
    const w = bijlagen(weg?.attachments);
    const gezien = new Set(h.map((x) => JSON.stringify(x)));
    return [...h, ...w.filter((x) => !gezien.has(JSON.stringify(x)))];
  })();

  await pgClient
    .begin(async (tx) => {
      // ── 1. de dubbele registratie opruimen ────────────────────────────────
      if (weg) {
        const mails = await tx`update email_inbox set linked_purchase_order_id = ${HOUD}, updated_at = now()
          where linked_purchase_order_id = ${WEG} returning id`;
        const keur = await tx`update purchase_invoice_reviews set purchase_order_id = ${HOUD}, updated_at = now()
          where purchase_order_id = ${WEG} returning id`;
        await tx`update purchase_invoice_reviews set duplicate_of_po_id = ${HOUD} where duplicate_of_po_id = ${WEG}`;

        await tx`insert into activities (type, subject, body) values (
          ${"note"},
          ${`Dubbele inkoopfactuur opgeruimd: Wilhelmus ${weg.reference ?? ""}`.trim()},
          ${
            `De urenverantwoording bij factuur N° 4 was als tweede factuur geboekt (${eur(Number(weg.total))}, zonder btw). ` +
            `Dezelfde factuur staat als "${houd.reference}" met ${eur(Number(houd.total))} incl. btw; beide waren als betaald aangemerkt, ` +
            `samen ${eur(Number(weg.total) + Number(houd.total))} terwijl er ${eur(Number(houd.total))} te betalen was. ` +
            `Mail en keurregel zijn omgehangen, de bijlagen samengevoegd. Verwijderde regel: ${JSON.stringify({
              id: weg.id,
              reference: weg.reference,
              total: weg.total,
              subtotal: weg.subtotal,
              tax: weg.tax,
              order_date: weg.order_date,
              received_at: weg.received_at,
              paid_at: weg.paid_at,
              status: weg.status,
              kind: weg.kind,
              attachments: bijlagen(weg.attachments),
            })}`
          }
        )`;

        await tx`delete from purchase_orders where id = ${WEG}`;
        console.log(`dubbel opgeruimd: "${weg.reference}" ${eur(Number(weg.total))} — ${mails.length} mail(s) en ${keur.length} keurregel(s) omgehangen, ${samengevoegd.length} bijlagen op de blijver\n`);
      } else {
        console.log("dubbele registratie stond er al niet meer\n");
      }

      // ── 2. splitsen over de projecten ─────────────────────────────────────
      for (const d of DELEN) {
        const deelEx = ex(d);
        const deelIncl = incl(d);
        const ref = `Wilhelmus 0-04 — ${d.naam}`;
        const notitie =
          `${houd.notes ?? ""}\n\nGesplitst 24-08-2026 per project volgens de urenverantwoording bij factuur N° 4 ` +
          `(JUSTIFICACION HORAS N°4). Dit deel: ${d.naam} — ${d.uren} uur à ${eur(TARIEF)} = ${eur(deelEx)} ex btw. ${d.werk}.`.trim();
        const regels = JSON.stringify([
          { name: `Uren ${d.naam} (${d.uren} u à ${eur(TARIEF)})`, units: 1, unitPrice: deelEx, note: d.werk },
        ]);

        console.log(
          `${d.naam.padEnd(26)} ${String(d.uren).padStart(5)} u  ${eur(deelEx).padStart(10)} ex + ${eur(d.btw).padStart(7)} btw = ${eur(deelIncl).padStart(10)}`,
        );

        let deelId = HOUD;
        if (d.grootste) {
          await tx`
            update purchase_orders set
              reference = ${ref}, project_id = ${d.project}, count_as_labor = true,
              total = ${deelIncl.toFixed(2)}, subtotal = ${deelEx.toFixed(2)}, tax = ${d.btw.toFixed(2)},
              paid_eur = ${houd.paid_at ? deelIncl.toFixed(2) : null},
              items = ${regels}::jsonb, attachments = ${JSON.stringify(samengevoegd)}::jsonb,
              notes = ${notitie}, updated_at = now()
            where id = ${HOUD}`;
        } else {
          const [nieuw] = (await tx`
            insert into purchase_orders
              (supplier, reference, status, kind, currency, order_date, due_date, received_at,
               total, subtotal, tax, project_id, count_as_labor, items, attachments, notes,
               stock_applied_at, paid_at, paid_eur)
            values
              (${houd.supplier}, ${ref}, ${houd.status}, ${houd.kind}, ${houd.currency},
               ${houd.order_date}, ${houd.due_date}, ${houd.received_at},
               ${deelIncl.toFixed(2)}, ${deelEx.toFixed(2)}, ${d.btw.toFixed(2)},
               ${d.project}, true, ${regels}::jsonb, ${JSON.stringify(samengevoegd)}::jsonb,
               ${notitie}, now(), ${houd.paid_at}, ${houd.paid_at ? deelIncl.toFixed(2) : null})
            returning id`) as unknown as Array<{ id: string }>;
          deelId = nieuw.id;
        }

        // ── 3. de uren zelf ────────────────────────────────────────────────
        // Zonder deze regel telt de kost nergens: een inkooporder met
        // count_as_labor wordt bewust uit de materiaalkosten gelaten.
        await tx`delete from time_entries where purchase_order_id = ${deelId} and self_logged_at is null`;
        await tx`
          insert into time_entries
            (project_id, worker_id, worker_name, date, hours, hourly_cost_eur, payment_method,
             purchase_order_id, paid_at, note)
          values
            (${d.project}, ${WORKER}, ${houd.supplier}, ${WERKDATUM}, ${d.uren.toFixed(2)},
             ${TARIEF.toFixed(2)}, ${"invoice"}, ${deelId}, ${houd.paid_at},
             ${`Uren via inkoopfactuur ${ref} — ${d.werk}`})`;
      }

      console.log(`${"".padEnd(26)} ${String(somUren).padStart(5)} u  ${eur(somEx).padStart(10)} ex + ${eur(somBtw).padStart(7)} btw = ${eur(somIncl).padStart(10)}`);

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${"Urenfactuur Wilhelmus 0-04 gesplitst over zes projecten"},
        ${`${eur(Number(houd.total))} (${somUren} uur à ${eur(TARIEF)} ex btw) verdeeld volgens de urenverantwoording bij de factuur: ${DELEN.map((d) => `${d.naam} ${d.uren} u ${eur(incl(d))}`).join(", ")}. Alle zes als arbeid geboekt, met een urenregel per project.`}
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
      select po.reference, po.total, po.subtotal, po.tax, po.paid_eur, pr.name as project,
             (select coalesce(sum(te.hours), 0) from time_entries te where te.purchase_order_id = po.id) as uren,
             (select coalesce(sum(te.hours * te.hourly_cost_eur), 0) from time_entries te where te.purchase_order_id = po.id) as arbeidskost
      from purchase_orders po left join projects pr on pr.id = po.project_id
      where po.reference like ${"Wilhelmus 0-04%"} order by po.total desc`) as unknown as Array<Record<string, string>>;
    console.log("\nresultaat:");
    let som = 0;
    let somArbeid = 0;
    for (const x of na) {
      som += Number(x.total);
      somArbeid += Number(x.arbeidskost);
      console.log(
        `  ${String(x.project).padEnd(26)} ${eur(Number(x.total)).padStart(10)} (ex ${x.subtotal} + btw ${x.tax}) · ${Number(x.uren)} u = ${eur(Number(x.arbeidskost))} arbeidskost`,
      );
    }
    console.log(`  ${"".padEnd(26)} ${eur(som).padStart(10)}  ${som === 1780.51 ? "gelijk aan de factuur" : "WIJKT AF VAN DE FACTUUR"}`);
    console.log(`  arbeidskost samen ${eur(somArbeid)} ${somArbeid === 1471.5 ? "= subtotaal ex btw" : "— WIJKT AF"}`);

    const [rest] = (await pgClient`
      select count(*)::int n, coalesce(sum(total), 0)::text t from purchase_orders
      where supplier ilike '%strijks%' and reference ilike '%FAC_25009%'`) as unknown as Array<{ n: number; t: string }>;
    console.log(`  dubbele FAC_25009-registraties over: ${rest.n}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
