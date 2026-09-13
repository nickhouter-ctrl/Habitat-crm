"use server";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { mailAttachments, purchaseInvoiceReviews } from "@/lib/db/schema";

/** Only creates a review card. No purchase order, project cost or Holded write. */
export async function queueMailInvoice(emailId: string, attachmentId: string) {
  await requireWriteUser(); z.string().uuid().parse(emailId); z.string().uuid().parse(attachmentId);
  const att = await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, attachmentId) });
  if (!att || att.emailId !== emailId) throw new Error("Bijlage hoort niet bij deze mail.");
  if (!/\.(pdf|jpe?g|png|webp|xlsx?|xlsm)$/i.test(att.filename)) throw new Error("Kies een PDF, afbeelding of Excel-factuur.");
  const [created] = await db.insert(purchaseInvoiceReviews).values({ emailId, mailAttachmentId: attachmentId,
    source: "manual", proposedReference: att.filename, aiReadOk: false, aiCheckedAt: new Date(),
    aiError: "Factuur staat klaar; uitlezing wordt voorbereid.", verdict: "pending",
  }).onConflictDoNothing({ target: purchaseInvoiceReviews.mailAttachmentId }).returning({ id: purchaseInvoiceReviews.id, status: purchaseInvoiceReviews.status });
  if (created) {
    after(async () => {
      try {
        const { buildInvoiceProposal, upsertInvoiceReview } = await import("@/lib/purchase-invoice-intake");
        const proposal = await buildInvoiceProposal({ emailId, attachmentId });
        if (proposal) await upsertInvoiceReview(proposal, "manual");
      } catch { console.warn("Handmatig klaargezette factuur wacht op een nieuwe uitleespoging."); }
    });
  }
  const review = created ?? await db.query.purchaseInvoiceReviews.findFirst({ where: eq(purchaseInvoiceReviews.mailAttachmentId, attachmentId), columns: { id: true, status: true } });
  if (!review) throw new Error("Klaarzetten niet gelukt. Probeer opnieuw.");
  revalidatePath("/inbox"); revalidatePath("/inkooporders/te-verwerken"); revalidatePath("/");
  return review;
}
