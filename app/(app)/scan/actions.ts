"use server";

import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, products } from "@/lib/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

export type ScannedProduct = {
  id: string;
  sku: string | null;
  name: string;
  stockQty: number;
  imageUrl: string | null;
};

/** Zoek een product op streepjescode (of SKU als terugval). */
export async function findProductByBarcode(code: string): Promise<ScannedProduct | null> {
  await requireUser();
  const c = code.trim();
  if (!c) return null;
  const p = await db.query.products.findFirst({
    where: or(eq(products.barcode, c), eq(products.sku, c)),
    columns: { id: true, sku: true, name: true, stockQty: true, imageUrl: true },
  });
  if (!p) return null;
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    stockQty: Number(p.stockQty ?? 0),
    imageUrl: p.imageUrl ?? null,
  };
}

/** Pas de voorraad aan: erbij (ontvangen), eraf (uitgeven) of zetten (tellen). */
export async function adjustStock(
  productId: string,
  mode: "in" | "out" | "set",
  amount: number,
): Promise<{ ok: boolean; stockQty?: number }> {
  const user = await requireUser();
  const a = Math.abs(Number(amount) || 0);
  if (!productId || a <= 0) return { ok: false };
  const p = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { stockQty: true, sku: true, name: true },
  });
  if (!p) return { ok: false };
  const cur = Number(p.stockQty ?? 0);
  const next = mode === "set" ? a : mode === "in" ? cur + a : cur - a;
  await db.update(products).set({ stockQty: String(next), updatedAt: new Date() }).where(eq(products.id, productId));
  await db.insert(activities).values({
    type: "note",
    subject: `Voorraad via scan — ${p.sku ?? p.name}`,
    body:
      (mode === "set" ? `Geteld op ${a}` : mode === "in" ? `Ontvangen +${a}` : `Uitgegeven −${a}`) +
      ` → nieuwe stand ${next} (was ${cur}).`,
    authorId: user.id,
  });
  revalidatePath("/products");
  revalidatePath("/");
  return { ok: true, stockQty: next };
}
