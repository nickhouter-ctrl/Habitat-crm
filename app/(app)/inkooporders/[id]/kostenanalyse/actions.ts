"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, mailAttachments } from "@/lib/db/schema";
import { applyLandedCostToProducts } from "@/lib/landed-cost";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Niet ingelogd");
  return session.user;
}

/** Sla het bedrag op voor één attachment (handmatig invullen). */
export async function saveAttachmentAmount(
  attachmentId: string,
  amount: string,
  poId: string,
) {
  await requireUser();
  const num = amount.trim() === "" ? null : Number(amount.replace(",", "."));
  await db
    .update(mailAttachments)
    .set({
      amountEur: num != null && Number.isFinite(num) ? String(num) : null,
      updatedAt: new Date(),
    })
    .where(eq(mailAttachments.id, attachmentId));
  revalidatePath(`/inkooporders/${poId}/kostenanalyse`);
}

/** Apply landed-cost ratio op alle PO-producten. */
export async function applyLandedCost(purchaseOrderId: string, ratio: number) {
  const user = await requireUser();
  const result = await applyLandedCostToProducts({ purchaseOrderId, ratio });
  await db.insert(activities).values({
    type: "note",
    subject: `Landed-cost toegepast (ratio ${(ratio * 100).toFixed(2)}%)`,
    body: `${result.updated} producten bijgewerkt, ${result.skipped} overgeslagen.`,
    authorId: user.id,
  });
  revalidatePath(`/inkooporders/${purchaseOrderId}/kostenanalyse`);
  revalidatePath(`/inkooporders/${purchaseOrderId}`);
  revalidatePath("/products");
}
