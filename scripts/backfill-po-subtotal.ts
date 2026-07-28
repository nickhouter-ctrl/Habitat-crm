/**
 * Vult het ontbrekende SUBTOTAAL (ex. btw) op inkooporders aan door de bron-PDF
 * opnieuw met de AI uit te lezen. Zonder subtotaal moeten kosten terugvallen op
 * het factuurtotaal (mogelijk incl. btw) — zie poExVat() in lib/purchase-orders.ts.
 *
 * Standaard DRY-RUN (toont alleen wat het zou zetten):
 *   npx tsx scripts/backfill-po-subtotal.ts
 * Daadwerkelijk wegschrijven:
 *   npx tsx scripts/backfill-po-subtotal.ts --write
 * Beperken tot N inkooporders (bv. eerst een proef):
 *   npx tsx scripts/backfill-po-subtotal.ts --limit 5
 */
import "./load-env";
import { db } from "../lib/db";
import { purchaseOrders } from "../lib/db/schema";
import { extractInvoiceFieldsFromBuffer } from "../lib/ai-invoice-extract";
import { normalizePoAttachments } from "../lib/purchase-orders";
import { downloadPurchaseOrderBuffer } from "../lib/storage";
import { eq, sql } from "drizzle-orm";

const WRITE = process.argv.includes("--write");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) || 0 : 0;

function contentTypeFor(name: string): string {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.xlsx?$/i.test(name)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

(async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY ontbreekt — zet die in .env.local.");
    process.exit(1);
  }

  const rows = await db
    .select()
    .from(purchaseOrders)
    .where(sql`coalesce(nullif(subtotal, 0), 0) = 0 and coalesce(tax, 0) = 0 and coalesce(total, 0) <> 0`)
    .orderBy(sql`total desc`);

  const todo = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
  console.log(`${rows.length} inkooporders zonder btw/subtotaal; ${todo.length} worden nu bekeken.`);
  console.log(WRITE ? "MODUS: wegschrijven\n" : "MODUS: dry-run (niets wordt opgeslagen)\n");

  let filled = 0;
  let skipped = 0;
  for (const po of todo) {
    const label = `${po.supplier}${po.reference ? ` · ${po.reference}` : ""}`;
    const att = normalizePoAttachments(po.attachments).find((a) => /\.(pdf|xlsx?)$/i.test(a.name));
    if (!att) {
      console.log(`—  ${label}: geen bruikbare bijlage`);
      skipped++;
      continue;
    }
    const buffer = await downloadPurchaseOrderBuffer(att.path);
    if (!buffer) {
      console.log(`—  ${label}: bijlage niet te downloaden (${att.name})`);
      skipped++;
      continue;
    }
    const ai = await extractInvoiceFieldsFromBuffer({
      buffer,
      filename: att.name,
      contentType: contentTypeFor(att.name),
    });
    const total = Number(po.total);
    const sub = ai?.subtotal ?? null;

    // Plausibiliteitscheck: het subtotaal hoort ≤ het totaal te zijn en er hoort
    // niet meer dan ~25% btw tussen te zitten. Wijkt het af, dan liever niets
    // wegschrijven dan een verkeerd cijfer vastleggen.
    const plausible =
      sub != null && sub > 0 && sub <= total * 1.001 && sub >= total / 1.26;
    if (!plausible) {
      console.log(
        `?  ${label}: AI gaf subtotaal ${sub ?? "—"} bij totaal ${total.toFixed(2)} — overgeslagen`,
      );
      skipped++;
      continue;
    }

    const tax = Math.round((total - sub) * 100) / 100;
    const pct = sub > 0 ? Math.round((tax / sub) * 1000) / 10 : 0;
    console.log(`✓  ${label}: totaal ${total.toFixed(2)} → ex. btw ${sub.toFixed(2)} (btw ${tax.toFixed(2)} = ${pct}%)`);
    filled++;

    if (WRITE) {
      await db
        .update(purchaseOrders)
        .set({ subtotal: sub.toFixed(2), tax: tax.toFixed(2), updatedAt: new Date() })
        .where(eq(purchaseOrders.id, po.id));
    }
  }

  console.log(`\nKlaar: ${filled} met subtotaal, ${skipped} overgeslagen.`);
  if (!WRITE && filled > 0) console.log("Draai opnieuw met --write om dit op te slaan.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
