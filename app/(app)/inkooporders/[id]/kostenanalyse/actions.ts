"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireWriteUser } from "@/lib/auth/guards";

import { db } from "@/lib/db";
import { activities, mailAttachments } from "@/lib/db/schema";
import { applyLandedCostToProducts } from "@/lib/landed-cost";
import { moneyOrNull } from "@/lib/parse-money";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

/** Sla het bedrag op voor één attachment (handmatig invullen). */
export async function saveAttachmentAmount(
  attachmentId: string,
  amount: string,
  poId: string,
) {
  await requireUser();
  await db
    .update(mailAttachments)
    .set({
      amountEur: moneyOrNull(amount),
      updatedAt: new Date(),
    })
    .where(eq(mailAttachments.id, attachmentId));
  revalidatePath(`/inkooporders/${poId}/kostenanalyse`);
}

/** Apply landed-cost op alle PO-producten. Ratio wordt server-side herberekend. */
export async function applyLandedCost(purchaseOrderId: string) {
  const user = await requireUser();
  const result = await applyLandedCostToProducts({ purchaseOrderId });
  await db.insert(activities).values({
    type: "note",
    subject: `Landed-cost toegepast (ratio ${(result.ratio * 100).toFixed(2)}%)`,
    body: `${result.updated} producten bijgewerkt, ${result.skipped} overgeslagen.`,
    authorId: user.id,
  });
  revalidatePath(`/inkooporders/${purchaseOrderId}/kostenanalyse`);
  revalidatePath(`/inkooporders/${purchaseOrderId}`);
  revalidatePath("/products");
}
