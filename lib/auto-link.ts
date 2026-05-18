/**
 * Auto-link inkomende mails aan Purchase Orders op basis van shipment-references.
 * Detecteert refs in subject/body/filenames en matcht tegen PO.shipmentRef /
 * PO.containerRef / PO.reference. Bij match: emailInbox.linkedPurchaseOrderId.
 */
import { eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailInbox, mailAttachments, purchaseOrders } from "@/lib/db/schema";
import { extractShipmentRefs } from "@/lib/landed-cost";

/**
 * Vind het beste matchende PO voor een gegeven email. Returns PO-id of null.
 */
export async function findMatchingPO(emailId: string): Promise<string | null> {
  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, emailId) });
  if (!mail) return null;

  // Verzamel alle text — subject + body + filenames van attachments
  const atts = await db
    .select({ filename: mailAttachments.filename })
    .from(mailAttachments)
    .where(eq(mailAttachments.emailId, emailId));
  const haystack = [
    mail.subject ?? "",
    mail.bodyText ?? "",
    (mail.bodyHtml ?? "").slice(0, 5000),
    ...atts.map((a) => a.filename),
  ].join(" ");

  const refs = extractShipmentRefs(haystack);
  if (refs.length === 0) return null;

  // Match elke ref tegen alle PO's
  // PO.reference / PO.shipmentRef / PO.containerRef bevatten meestal 1 ref
  // We zoeken een PO waar minstens 1 van de geëxtraheerde refs in voorkomt
  for (const ref of refs) {
    const safe = ref.replace(/[%_]/g, ""); // escape SQL wildcards
    const found = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        or(
          ilike(purchaseOrders.reference, `%${safe}%`),
          ilike(purchaseOrders.shipmentRef, `%${safe}%`),
          ilike(purchaseOrders.containerRef, `%${safe}%`),
        ),
      )
      .limit(1);
    if (found.length > 0) return found[0].id;
  }
  return null;
}

/** Probeer auto-link voor één email. Returns of er gelinkt is. */
export async function autoLinkEmail(emailId: string): Promise<{
  linkedPoId: string | null;
  matchedRefs: string[];
}> {
  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, emailId) });
  if (!mail) return { linkedPoId: null, matchedRefs: [] };
  if (mail.linkedPurchaseOrderId) {
    // Al gelinkt
    return { linkedPoId: mail.linkedPurchaseOrderId, matchedRefs: [] };
  }

  const haystack = [mail.subject ?? "", mail.bodyText ?? ""].join(" ");
  const refs = extractShipmentRefs(haystack);

  const poId = await findMatchingPO(emailId);
  if (poId) {
    await db
      .update(emailInbox)
      .set({ linkedPurchaseOrderId: poId, status: "linked", updatedAt: new Date() })
      .where(eq(emailInbox.id, emailId));
  }
  return { linkedPoId: poId, matchedRefs: refs };
}

/** Run auto-link voor alle 'new' emails die nog niet gelinkt zijn. */
export async function autoLinkAllPending(): Promise<{
  scanned: number;
  linked: number;
}> {
  const pending = await db
    .select({ id: emailInbox.id })
    .from(emailInbox)
    .where(sql`${emailInbox.linkedPurchaseOrderId} IS NULL AND ${emailInbox.status} = 'new'`)
    .limit(500);

  let linked = 0;
  for (const row of pending) {
    const r = await autoLinkEmail(row.id);
    if (r.linkedPoId) linked++;
  }
  return { scanned: pending.length, linked };
}
