/**
 * Binnenkomende factuurbijlagen klaarzetten ter beoordeling.
 *
 * Wordt aangeroepen vanuit de cron-poller. Maakt sinds de goedkeuringspoort
 * GEEN inkooporders meer: elke financiële bijlage wordt uitgelezen, beoordeeld
 * en in `purchase_invoice_reviews` gezet. Pas na goedkeuring ontstaat er een
 * inkooporder die meetelt in de kosten en naar Holded kan.
 */
import { and, asc, eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailInbox, mailAttachments, purchaseInvoiceReviews } from "@/lib/db/schema";
import {
  attachReviewToSibling,
  buildInvoiceProposal,
  buildPurchaseReference,
  FINANCIAL_CATEGORIES,
  isProformaOrQuote,
  isSpecificationAttachment,
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

/**
 * Herkanst wachtende facturen waarvan de AI-uitlezing TECHNISCH faalde
 * (netwerkfout, 5xx, timeout, rate limit). Zo'n kaart bleef vroeger voorgoed
 * op "niet gelezen" staan — de poller kijkt alleen naar nieuwe mails.
 *
 * Maximaal drie herkansingen per factuur (ai_attempts) en pas als de vorige
 * poging ≥ 10 minuten oud is: een storing bij de AI-leverancier lost zichzelf
 * niet binnen dezelfde minuut op. Draait mee met elke poll-ronde.
 */
export async function retryFailedAiReads(limiet = 5): Promise<{ geprobeerd: number; hersteld: number }> {
  const rows = await db
    .select({
      id: purchaseInvoiceReviews.id,
      emailId: purchaseInvoiceReviews.emailId,
      attachmentId: purchaseInvoiceReviews.mailAttachmentId,
    })
    .from(purchaseInvoiceReviews)
    .where(
      and(
        eq(purchaseInvoiceReviews.status, "pending"),
        eq(purchaseInvoiceReviews.aiReadOk, false),
        lt(purchaseInvoiceReviews.aiAttempts, 3),
        lt(purchaseInvoiceReviews.aiCheckedAt, new Date(Date.now() - 10 * 60_000)),
      ),
    )
    .orderBy(asc(purchaseInvoiceReviews.aiCheckedAt))
    .limit(limiet);

  let hersteld = 0;
  for (const r of rows) {
    // Teller vóór de poging: ook een poging die wéér faalt telt mee, anders
    // blijft een structureel kapotte bijlage eeuwig herkansen.
    await db
      .update(purchaseInvoiceReviews)
      .set({ aiAttempts: sql`${purchaseInvoiceReviews.aiAttempts} + 1` })
      .where(eq(purchaseInvoiceReviews.id, r.id));
    try {
      const proposal = await buildInvoiceProposal({ emailId: r.emailId, attachmentId: r.attachmentId });
      if (!proposal) continue;
      await upsertInvoiceReview(proposal, "auto");
      if (proposal.verdict.readOk) hersteld++;
    } catch (e) {
      console.error("Herkansing AI-uitlezing faalde:", e instanceof Error ? e.message : e);
    }
  }
  return { geprobeerd: rows.length, hersteld };
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

  // Bijhouden welke kaart bij welke bijlage hoort: is er in deze mail zowel een
  // factuur als een specificatie, dan hangen we die straks aan elkaar in plaats
  // van er twee te-betalen posten van te maken.
  const gemaakt: { reviewId: string; filename: string; spec: boolean }[] = [];

  for (const a of financial) {
    try {
      const proposal = await buildInvoiceProposal({ emailId, attachmentId: a.id });
      if (!proposal) continue;
      const reviewId = await upsertInvoiceReview(proposal, "auto");
      result.reviewIds.push(reviewId);
      result.created++;
      gemaakt.push({ reviewId, filename: a.filename, spec: isSpecificationAttachment(a.filename) });

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

  await koppelSpecificatiesAanFactuur(gemaakt, result);

  return result;
}


/** Volgnummer uit een bestandsnaam: "JUSTIFICACION HORAS N°4 WILHELMUS" → "4". */
function volgnummer(filename: string): string | null {
  const m = filename.match(/(?:n[º°o]\.?|nr\.?|nummer|number)\s*([0-9]{1,4})/i);
  return m ? String(Number(m[1])) : null;
}

/**
 * Eén mail met een factuur én haar urenverantwoording levert twee kaarten in de
 * wachtrij op. Alleen de factuur is een te-betalen post; de specificatie hoort
 * als bijlage op diezelfde inkooporder. Dat kon al met de hand — nu gebeurt het
 * vanzelf, want twee kaarten die er hetzelfde uitzien wórden ook allebei
 * goedgekeurd (zie Wilhelmus N° 4).
 *
 * Alleen als er in dezelfde mail ook echt een factuur zit: een leverancier die
 * enkel een urenstaat stuurt houdt gewoon zijn plek in de wachtrij.
 */
async function koppelSpecificatiesAanFactuur(
  gemaakt: { reviewId: string; filename: string; spec: boolean }[],
  result: AutoInvoiceResult,
): Promise<void> {
  const specs = gemaakt.filter((g) => g.spec);
  const facturen = gemaakt.filter((g) => !g.spec);
  if (specs.length === 0 || facturen.length === 0) return;

  for (const spec of specs) {
    // Bij meerdere facturen in één mail alleen koppelen als het volgnummer
    // hetzelfde is ("N°4" ↔ "N° 4"); anders liever laten staan dan gokken.
    const doel =
      facturen.length === 1
        ? facturen[0]
        : (() => {
            const n = volgnummer(spec.filename);
            const treffers = n ? facturen.filter((f) => volgnummer(f.filename) === n) : [];
            return treffers.length === 1 ? treffers[0] : null;
          })();
    if (!doel) continue;

    const uitkomst = await attachReviewToSibling({
      reviewId: spec.reviewId,
      targetReviewId: doel.reviewId,
      userId: null,
    });
    if (uitkomst.ok) {
      result.reviewIds = result.reviewIds.filter((id) => id !== spec.reviewId);
      result.created--;
      console.log(`[inkoop] "${spec.filename}" gekoppeld als specificatie bij "${doel.filename}"`);
    }
  }
}
