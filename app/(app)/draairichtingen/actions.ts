"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents, products } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
}

const ORIENTS = ["S1", "S2", "S3", "S4"] as const;

/**
 * Verdeel één deur(set)-regel over draairichtingen. De gebruiker geeft per
 * richting (S1–S4) een aantal op; de som moet gelijk zijn aan het aantal op de
 * regel. De regel wordt opgesplitst in deelregels per richting, en de
 * voorraad-uitsplitsing (additionalSizes) van het product wordt bijgewerkt.
 */
export async function assignDoorOrientation(docId: string, productId: string, lineIndex: number, formData: FormData) {
  await requireUser();

  const counts: Record<string, number> = {};
  for (const s of ORIENTS) counts[s] = Math.max(0, Math.floor(Number(formData.get(s)) || 0));
  const total = ORIENTS.reduce((sum, s) => sum + counts[s], 0);

  const doc = await db.query.documents.findFirst({ where: eq(documents.id, docId) });
  if (!doc) return;
  const items = normalizeDocItems(doc.items);
  const line = items[lineIndex];
  if (!line || line.productId !== productId) redirect(`/draairichtingen?error=notfound`);
  const units = Number(line.units) || 0;
  if (total !== units) redirect(`/draairichtingen?error=sum`);

  // Regel opsplitsen in deelregels per richting (richting in de naam).
  const baseName = line.name.replace(/\s*·\s*S[1-4].*$/, "");
  const newLines = ORIENTS.filter((s) => counts[s] > 0).map((s) => ({
    ...line,
    name: `${baseName} · ${s}`,
    units: counts[s],
  }));
  items.splice(lineIndex, 1, ...newLines);
  await db.update(documents).set({ items, updatedAt: new Date() }).where(eq(documents.id, docId));

  // Voorraad-uitsplitsing per richting bijwerken (additionalSizes van het product).
  const prod = await db.query.products.findFirst({ where: eq(products.id, productId) });
  const sizes = prod?.additionalSizes;
  if (sizes?.length) {
    const updated = sizes.map((sz) => {
      const m = (sz.label ?? "").match(/\bS([1-4])\b/);
      const key = m ? `S${m[1]}` : null;
      if (key && counts[key]) return { ...sz, stockQty: (Number(sz.stockQty) || 0) - counts[key] };
      return sz;
    });
    await db.update(products).set({ additionalSizes: updated, updatedAt: new Date() }).where(eq(products.id, productId));
  }

  revalidatePath("/draairichtingen");
  revalidatePath(`/documents/${docId}`);
  redirect("/draairichtingen?saved=1");
}
