/**
 * Haalt de Ahmed-facturen die al als inkooporder bestaan uit de keurwachtrij —
 * 13-08-2026.
 *
 * Achtergrond: de wachtrij kreeg 22 facturen van Ahmed Bouzekri, maar 12 daarvan
 * waren allang geboekt (A0003–A0008 en A0024–A0028). Die opnieuw goedkeuren zou
 * ze dubbel in de inkoop én in Holded zetten. Ze worden hier op "ignored" gezet
 * met een verwijzing naar de bestaande inkooporder, zodat de reden terug te
 * vinden is.
 *
 * Bewust NIET via `ignoreInvoiceReview()`: die archiveert ook de mail, en één
 * mail bevat hier meerdere facturen (A0003 t/m A0014 kwamen samen binnen op
 * 24 juni). De mail archiveren terwijl de helft nog gekeurd moet worden zou de
 * rest uit beeld halen.
 *
 * Matcht op FACTUURNUMMER, niet op bedrag: twee facturen kunnen hetzelfde
 * bedrag hebben.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/ahmed-al-geboekt-afvinken.ts --dry
 */
import "./load-env";

import { and, eq } from "drizzle-orm";

import { db, pgClient } from "../lib/db";
import { purchaseInvoiceReviews } from "../lib/db/schema";

/** Het overzichtsbestand is geen factuur maar de som van A0003 t/m A0013. */
const OVERZICHTSBESTAND = "Facturen_Ahmed_Bouzekri_A0003-A0012.xlsx";

type Review = { id: string; ref: string | null; total: string | null; filename: string };
type Po = { id: string; reference: string; total: string };

const factuurnummer = (s: string | null | undefined) =>
  (String(s ?? "").match(/\bA0\d{3}\b/i) ?? [])[0]?.toUpperCase() ?? null;

async function main() {
  const dry = process.argv.includes("--dry");

  const reviews = (await pgClient`
    select r.id, r.proposed_reference as ref, r.proposed_total as total, a.filename
    from purchase_invoice_reviews r
    join mail_attachments a on a.id = r.mail_attachment_id
    where r.status = 'pending' and r.proposed_supplier ilike '%ahmed%'
    order by r.proposed_reference
  `) as unknown as Review[];

  const pos = (await pgClient`
    select id, reference, total from purchase_orders where reference ~* 'A0[0-9]{3}'
  `) as unknown as Po[];
  const poOp = new Map<string, Po>();
  for (const p of pos) {
    const n = factuurnummer(p.reference);
    if (n && !poOp.has(n)) poOp.set(n, p);
  }

  let afgevinkt = 0;
  let blijft = 0;
  for (const r of reviews) {
    // Het overzichtsbestand apart afhandelen: geen factuur, en het bedrag is de
    // som van elf facturen — goedkeuren zou die allemaal nóg eens boeken.
    if (r.filename === OVERZICHTSBESTAND) {
      console.log(`OVERZICHT  ${r.filename} (€ ${r.total}) → uit de wachtrij, is geen losse factuur`);
      if (!dry) {
        await db
          .update(purchaseInvoiceReviews)
          .set({
            status: "ignored",
            decisionNote: "Overzichtsbestand van A0003 t/m A0013, geen losse factuur — de facturen zelf staan apart in de wachtrij.",
            decidedAt: new Date(),
            decidedVia: "app",
            updatedAt: new Date(),
          })
          .where(and(eq(purchaseInvoiceReviews.id, r.id), eq(purchaseInvoiceReviews.status, "pending")));
      }
      afgevinkt++;
      continue;
    }

    const nr = factuurnummer(r.ref) ?? factuurnummer(r.filename);
    const po = nr ? poOp.get(nr) : undefined;
    if (!po) {
      console.log(`BLIJFT     ${nr ?? "?"} · € ${r.total} — nog niet geboekt, blijft ter keuring staan`);
      blijft++;
      continue;
    }
    const verschil = Math.abs(Number(r.total ?? 0) - Number(po.total));
    console.log(
      `AFVINKEN   ${nr} · € ${r.total} → bestaat al als "${po.reference}" (€ ${po.total})` +
        (verschil > 0.02 ? `  LET OP: verschil € ${verschil.toFixed(2)}` : ""),
    );
    afgevinkt++;
    if (!dry) {
      await db
        .update(purchaseInvoiceReviews)
        .set({
          status: "ignored",
          purchaseOrderId: po.id,
          duplicateOfPoId: po.id,
          decisionNote: `Al geboekt als inkooporder "${po.reference}" (€ ${po.total}). Niet nogmaals goedgekeurd om dubbele boeking te voorkomen.`,
          decidedAt: new Date(),
          decidedVia: "app",
          updatedAt: new Date(),
        })
        .where(and(eq(purchaseInvoiceReviews.id, r.id), eq(purchaseInvoiceReviews.status, "pending")));
    }
  }

  console.log(`\n${dry ? "[DRY RUN] " : ""}${afgevinkt} uit de wachtrij, ${blijft} blijven ter keuring staan.`);
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
