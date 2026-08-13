/**
 * Splitst A0009 en A0012 van Ahmed Bouzekri per project — 13-08-2026.
 *
 * Beide facturen bestrijken twee klussen tegelijk; daarom bleven ze als enige
 * van de reeks zonder project liggen. Eén inkooporder kan maar aan één project
 * hangen, dus elke factuur wordt hier twee inkooporders met het bedrag dat op
 * de factuurregel staat:
 *
 *   A0009  Silvestre € 2.800,00 · Cap Negre € 1.152,00   (ex. btw)
 *   A0012  Silvestre €   997,90 · Cap Negre €   110,00   (ex. btw)
 *
 * "Cap Negre" is in het CRM het project Finca Lisa.
 *
 * De btw wordt naar rato verdeeld, zodat de twee delen samen exact het
 * oorspronkelijke totaal blijven — afrondingsverschil komt op het grootste deel
 * terecht, niet op beide. De referenties krijgen een achtervoegsel (-SIL / -CN)
 * zodat het factuurnummer herkenbaar blijft maar niet twee identieke regels
 * oplevert.
 *
 * De bestaande inkooporder wordt hergebruikt voor het grootste deel; alleen het
 * kleinste deel komt er als nieuwe regel bij. Zo blijven de gekoppelde mail,
 * bijlage en keurregel hangen waar ze horen.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/splits-ahmed-a0009-a0012.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const SILVESTRE = "4cb9735a-f50c-48c9-abf6-8321c5ddf95f";
const FINCA_LISA = "7b06cf54-d07e-420e-aa6a-bb6e85628e0a"; // = Cap Negre

type Splitsing = {
  referentie: string;
  /** Ex. btw per project, letterlijk van de factuurregels. */
  silvestre: number;
  capNegre: number;
};

const SPLITSINGEN: Splitsing[] = [
  { referentie: "Ahmed Bouzekri A0009", silvestre: 2800.0, capNegre: 1152.0 },
  { referentie: "Ahmed Bouzekri A0012", silvestre: 997.9, capNegre: 110.0 },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `€ ${n.toFixed(2)}`;

type Po = {
  id: string;
  supplier: string;
  reference: string;
  total: string;
  subtotal: string | null;
  tax: string | null;
  currency: string;
  order_date: string | null;
  due_date: string | null;
  received_at: string | null;
  status: string;
  kind: string;
  count_as_labor: boolean;
  notes: string | null;
  items: unknown;
  attachments: unknown;
};

async function main() {
  const dry = process.argv.includes("--dry");

  await pgClient
    .begin(async (tx) => {
      for (const s of SPLITSINGEN) {
        const [po] = (await tx`
          select id, supplier, reference, total, subtotal, tax, currency, order_date, due_date,
                 received_at, status, kind, count_as_labor, notes, items, attachments
          from purchase_orders where reference = ${s.referentie}
        `) as unknown as Po[];
        if (!po) {
          console.log(`(niet gevonden, mogelijk al gesplitst) ${s.referentie}`);
          continue;
        }
        if (/-SIL$|-CN$/.test(po.reference)) {
          console.log(`(al gesplitst) ${s.referentie}`);
          continue;
        }

        const totaal = Number(po.total);
        const subtotaal = po.subtotal != null ? Number(po.subtotal) : s.silvestre + s.capNegre;
        const btw = po.tax != null ? Number(po.tax) : r2(totaal - subtotaal);

        // Btw naar rato van het subtotaal. Het kleinste deel krijgt de afgeronde
        // waarde, het grootste deel de rest — zo tellen de twee samen exact op
        // tot het origineel in plaats van een cent te missen.
        const btwKlein = r2((btw * s.capNegre) / subtotaal);
        const btwGroot = r2(btw - btwKlein);
        const totaalGroot = r2(s.silvestre + btwGroot);
        const totaalKlein = r2(s.capNegre + btwKlein);

        if (r2(totaalGroot + totaalKlein) !== r2(totaal)) {
          throw new Error(`${s.referentie}: ${eur(totaalGroot)} + ${eur(totaalKlein)} ≠ ${eur(totaal)} — gestopt.`);
        }

        console.log(`${s.referentie}  ${eur(totaal)} incl.`);
        console.log(`   Silvestre   ${eur(s.silvestre)} ex + ${eur(btwGroot)} btw = ${eur(totaalGroot)}`);
        console.log(`   Finca Lisa  ${eur(s.capNegre)} ex + ${eur(btwKlein)} btw = ${eur(totaalKlein)}`);

        const notitie = (deel: string) =>
          `${po.notes ?? ""}\n\nGesplitst 13-08-2026: deze factuur bestrijkt twee klussen. ` +
          `Silvestre ${eur(s.silvestre)} en Cap Negre ${eur(s.capNegre)} (ex. btw), btw naar rato verdeeld. ` +
          `Dit is het deel voor ${deel}.`.trim();

        if (!dry) {
          // Grootste deel: bestaande regel hergebruiken, zodat mail, bijlage en
          // keurregel eraan blijven hangen.
          await tx`
            update purchase_orders set
              reference = ${`${po.reference} -SIL`},
              project_id = ${SILVESTRE},
              total = ${totaalGroot.toFixed(2)},
              subtotal = ${s.silvestre.toFixed(2)},
              tax = ${btwGroot.toFixed(2)},
              notes = ${notitie("Silvestre")},
              updated_at = now()
            where id = ${po.id}`;

          // Kleinste deel als nieuwe inkooporder op het andere project.
          await tx`
            insert into purchase_orders
              (supplier, reference, status, kind, currency, order_date, due_date, received_at,
               total, subtotal, tax, project_id, count_as_labor, items, attachments, notes, stock_applied_at)
            values
              (${po.supplier}, ${`${po.reference} -CN`}, ${po.status}, ${po.kind}, ${po.currency},
               ${po.order_date}, ${po.due_date}, ${po.received_at},
               ${totaalKlein.toFixed(2)}, ${s.capNegre.toFixed(2)}, ${btwKlein.toFixed(2)},
               ${FINCA_LISA}, ${po.count_as_labor},
               ${JSON.stringify([{ name: `${po.reference} — deel Cap Negre`, units: 1, unitPrice: s.capNegre }])}::jsonb,
               ${JSON.stringify(Array.isArray(po.attachments) ? po.attachments : [])}::jsonb,
               ${notitie("Cap Negre (Finca Lisa)")}, now())`;

          await tx`insert into activities (type, subject, body) values (
            ${"note"},
            ${`Inkoopfactuur gesplitst per project: ${po.reference}`},
            ${`${eur(totaal)} verdeeld over Silvestre ${eur(totaalGroot)} en Finca Lisa (Cap Negre) ${eur(totaalKlein)}, volgens de regels op de factuur.`}
          )`;
        }
        console.log();
      }
      if (dry) throw new Error("__DRY__");
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "__DRY__") {
        console.log("[DRY RUN] teruggedraaid — er is niets gewijzigd.");
        return;
      }
      throw e;
    });

  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
