/**
 * Binnenkomende factuurbijlagen klaarzetten ter beoordeling.
 *
 * Wordt aangeroepen vanuit de cron-poller. Maakt sinds de goedkeuringspoort
 * GEEN inkooporders meer: elke financiële bijlage wordt uitgelezen, beoordeeld
 * en in `purchase_invoice_reviews` gezet. Pas na goedkeuring ontstaat er een
 * inkooporder die meetelt in de kosten en naar Holded kan.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailInbox, mailAttachments } from "@/lib/db/schema";
import {
  buildInvoiceProposal,
  buildPurchaseReference,
  FINANCIAL_CATEGORIES,
  isProformaOrQuote,
  upsertInvoiceReview,
} from "@/lib/purchase-invoice-intake";

// Blijft hier geëxporteerd: bestaande schermen importeren 'm van dit pad.
export { buildPurchaseReference };

export interface AutoInvoiceResult {
  created: number;
  needsReview: number;
  /** Nieuwe wachtrij-rijen, zodat de poller er één melding over kan sturen. */
  reviewIds: string[];
  errors: string[];
}

export async function tryAutoCreatePurchaseInvoice(emailId: string): Promise<AutoInvoiceResult> {
  const result: AutoInvoiceResult = { created: 0, needsReview: 0, reviewIds: [], errors: [] };

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, emailId) });
  if (!mail) return result;
  if (mail.linkedPurchaseOrderId) return result; // al aan een inkooporder gekoppeld

  // Alleen mail aan het inkoop-postvak. Het adres komt uit de omgeving, net als
  // bij de poller — hardcoderen liep uiteen zodra dat adres wijzigde.
  const purchaseUser = (process.env.GMAIL_PURCHASE_USER ?? "purchase@habitat-one.com").trim().toLowerCase();
  const envelope = `${mail.toEmail ?? ""} ${mail.ccEmail ?? ""}`.toLowerCase();
  if (!envelope.includes(purchaseUser)) return result;

  const atts = await db.select().from(mailAttachments).where(eq(mailAttachments.emailId, emailId));
  const financial = atts.filter((a) => FINANCIAL_CATEGORIES.includes(a.category as (typeof FINANCIAL_CATEGORIES)[number]) && !isProformaOrQuote(a.filename));
  if (financial.length === 0) return result;

  for (const a of financial) {
    try {
      const proposal = await buildInvoiceProposal({ emailId, attachmentId: a.id });
      if (!proposal) continue;
      const reviewId = await upsertInvoiceReview(proposal, "auto");
      result.reviewIds.push(reviewId);
      result.created++;

      // De uitgelezen gegevens ook op de bijlage bijwerken, zodat de bestaande
      // schermen (inbox, archief) hetzelfde bedrag en dezelfde leverancier tonen.
      const patch: Record<string, unknown> = {};
      if (proposal.supplier && !a.supplierTag) patch.supplierTag = proposal.supplier;
      if (proposal.total != null && a.amountEur == null) patch.amountEur = proposal.total.toFixed(2);
      if (Object.keys(patch).length > 0) {
        await db.update(mailAttachments).set(patch).where(eq(mailAttachments.id, a.id));
      }
    } catch (e) {
      // Een storing mag nooit betekenen dat een factuur verdwijnt: melden en door.
      result.errors.push(`${a.filename}: ${e instanceof Error ? e.message : String(e)}`);
      result.needsReview++;
    }
  }

  return result;
}
