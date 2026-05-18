/**
 * Automatische aanmaak van inkoopfacturen uit binnenkomende mail-bijlagen.
 *
 * Wordt aangeroepen vanuit de cron-poller. Beslist of een mail-bijlage
 * voldoende vertrouwen biedt om er direct een `purchase_orders` record uit
 * te maken (status='received'), of dat 'm doorzetten naar manual review.
 *
 * Push naar Holded gebeurt NIET automatisch — dat doet de gebruiker via de
 * "Sync naar Holded"-knop op /inkooporders.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, emailInbox, mailAttachments, purchaseOrders } from "@/lib/db/schema";
import { copyMailAttachmentToPoBucket } from "@/lib/storage";

const FINANCIAL_CATEGORIES = new Set([
  "supplier-invoice",
  "freight-invoice",
  "agent-fee-china",
  "agent-fee-spain",
  "opex",
]);

export interface AutoInvoiceResult {
  created: number;
  needsReview: number;
  errors: string[];
}

export async function tryAutoCreatePurchaseInvoice(emailId: string): Promise<AutoInvoiceResult> {
  const result: AutoInvoiceResult = { created: 0, needsReview: 0, errors: [] };

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, emailId) });
  if (!mail) return result;
  if (mail.linkedPurchaseOrderId) return result; // al gelinkt

  const atts = await db
    .select()
    .from(mailAttachments)
    .where(eq(mailAttachments.emailId, emailId));

  // Vind kandidaten: financiële bijlages met bedrag + supplier
  const candidates = atts.filter(
    (a) =>
      FINANCIAL_CATEGORIES.has(a.category) &&
      a.amountEur != null &&
      Number(a.amountEur) > 0 &&
      a.supplierTag != null,
  );

  // Heeft de mail financiële bijlagen maar onvoldoende data? → needs review
  const hasFinancial = atts.some((a) => FINANCIAL_CATEGORIES.has(a.category));
  if (hasFinancial && candidates.length === 0) {
    result.needsReview = 1;
    return result;
  }

  for (const a of candidates) {
    try {
      const total = Number(a.amountEur);
      const refMatch = a.filename.match(/(?:FAC[_-]?|Factura[_\s]*|Invoice[_\s]*)([\w\d-]+)/i);
      const reference = refMatch?.[1] ?? a.filename.replace(/\.[a-z]+$/i, "");

      // Skip als er al een PO bestaat met dezelfde supplier + reference (dedupe)
      const existing = await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.reference, reference),
      });
      if (existing && existing.supplier === a.supplierTag) continue;

      // Kopieer bron-bestand naar PO-bucket
      const copied = await copyMailAttachmentToPoBucket({
        mailStoragePath: a.storagePath,
        filename: a.filename,
      });

      const [po] = await db
        .insert(purchaseOrders)
        .values({
          supplier: a.supplierTag!,
          reference,
          status: "received",
          currency: "EUR",
          orderDate: (a.receivedAt ?? mail.receivedAt ?? new Date()).toISOString().slice(0, 10),
          receivedAt: a.receivedAt ?? mail.receivedAt ?? new Date(),
          total: String(total.toFixed(2)),
          items: [
            {
              name: mail.subject ?? `Factuur ${reference}`,
              units: 1,
              unitPrice: total,
              note: `Bron: ${a.filename}`,
            },
          ],
          attachments: copied
            ? [{ name: copied.name, path: copied.path, size: copied.size, uploadedAt: new Date().toISOString() }]
            : [],
          notes: `Auto-aangemaakt uit mail "${mail.subject ?? ""}" (${mail.fromEmail ?? ""}). Bijlage: ${a.filename}`,
          stockAppliedAt: new Date(), // GEEN voorraadmutatie
        })
        .returning({ id: purchaseOrders.id });

      // Link mail aan deze PO als nog niet gelinkt
      if (!mail.linkedPurchaseOrderId) {
        await db
          .update(emailInbox)
          .set({ linkedPurchaseOrderId: po.id, status: "linked", updatedAt: new Date() })
          .where(eq(emailInbox.id, emailId));
      }

      await db.insert(activities).values({
        type: "note",
        subject: `Auto-aangemaakte inkoopfactuur: ${a.supplierTag} ${reference}`,
        body: `Bedrag: €${total.toFixed(2)}\nBron: ${a.filename}\nNog niet naar Holded gesynced.`,
      });

      result.created++;
    } catch (e) {
      result.errors.push(`${a.filename}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
