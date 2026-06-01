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

/**
 * Bouw een nette referentie "Fabrieksnaam Factuurnummer" uit het mail-onderwerp.
 *
 * Agent-facturen (Allpack) hebben onderwerpen als:
 *   "PI +CI for PJ0050481-22044646 ,Factory:GEORGELIGHTING&ELECTRICITY"
 * → wordt "Georgelighting PJ0050481-22044646".
 *
 * Valt terug op de bestandsnaam als het onderwerp geen herkenbaar patroon
 * heeft, zodat leveranciers met een net factuurnummer in de bestandsnaam
 * (SHN, Hollandse Meesters, ...) ongewijzigd blijven. Handling-cost-facturen
 * krijgen een suffix zodat ze los van de goederenfactuur herkenbaar blijven.
 */
export function buildPurchaseReference(subject: string | null, filename: string): string {
  const subj = (subject ?? "").trim();
  // Factuurnummer: na "for " het eerste code-achtige token (bevat een cijfer).
  const numMatch = subj.match(/\bfor\s+([A-Za-z0-9][\w./-]*\d[\w./-]*)/i);
  // Fabriek: na "Factory:" tot komma/regeleinde.
  const facMatch = subj.match(/Factory\s*[:：]\s*([^,\n]+)/i);

  let base: string;
  if (numMatch) {
    const invoiceNo = numMatch[1].replace(/[.,;]+$/, "");
    const factory = facMatch ? cleanFactoryName(facMatch[1]) : "";
    base = factory ? `${factory} ${invoiceNo}` : invoiceNo;
  } else {
    // Nummer moet met een cijfer beginnen — voorkomt dat "factuur…" de
    // "FAC"-prefix triggert en "tuur" oplevert.
    const refMatch = filename.match(/(?:FAC[_-]?|Factura[_\s]*|Invoice[_\s]*)(\d[\w-]*)/i);
    base = refMatch?.[1] ?? filename.replace(/\.[a-z]+$/i, "");
  }

  // Handling-cost-factuur apart herkenbaar maken (zelfde order, eigen regel).
  if (/handling/i.test(filename)) base += " (handlingcost)";
  return base.trim();
}

/** Maak een fabrieksnaam leesbaar: drop "&…"-staart en Co./Ltd, en title-case. */
function cleanFactoryName(raw: string): string {
  let s = raw.split("&")[0].trim();
  s = s.replace(/[,\s]*\b(Co\.?,?\s*Ltd\.?|Limited|Inc\.?|Company|LLC)\b/gi, "").trim();
  s = s.replace(/\s{2,}/g, " ").replace(/[.,\s]+$/, "");
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
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
      const reference = buildPurchaseReference(mail.subject, a.filename);

      // Dedupe: skip ALS er al een PO bestaat met deze reference (ongeacht
      // supplier-spelling). Bij conflict liever de bestaande PO linken aan
      // de mail, dan dubbele records aanmaken.
      const existing = await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.reference, reference),
      });
      if (existing) {
        // Link mail aan de bestaande PO i.p.v. nieuwe aanmaken
        await db
          .update(emailInbox)
          .set({ linkedPurchaseOrderId: existing.id, status: "linked", updatedAt: new Date() })
          .where(eq(emailInbox.id, emailId));
        continue;
      }

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
