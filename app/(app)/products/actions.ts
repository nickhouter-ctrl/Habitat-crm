"use server";

import { count, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { isValidEan13, nextProductBarcode } from "@/lib/barcode";
import { hasCostBreakdown, landedCost } from "@/lib/pricing";

const num = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);
const int = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().int().min(0).max(100).optional(),
);
const pct = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().min(0).max(1000).optional(),
);
const qty = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().optional(),
);

const productSchema = z.object({
  name: z.string().trim().min(1).max(300),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  barcode: z.string().trim().max(40).optional().or(z.literal("")),
  stockQty: qty,
  collection: z.string().trim().max(120).optional().or(z.literal("")),
  category: z.string().trim().max(120).optional().or(z.literal("")),
  subcategory: z.string().trim().max(120).optional().or(z.literal("")),
  unit: z.string().trim().max(20).optional().or(z.literal("")),
  priceEur: num,
  vatRate: int,
  purchaseCostEur: num,
  freightCostEur: num,
  transportCostEur: num,
  otherCostEur: num,
  dutyPct: pct,
  targetMarginPct: pct,
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

const dec = (v: number | undefined) => (v === undefined ? null : String(v));

function toValues(v: z.infer<typeof productSchema>) {
  const breakdown = {
    purchaseCostEur: v.purchaseCostEur,
    freightCostEur: v.freightCostEur,
    transportCostEur: v.transportCostEur,
    otherCostEur: v.otherCostEur,
    dutyPct: v.dutyPct,
  };
  const cost = hasCostBreakdown(breakdown) ? landedCost(breakdown) : null;
  return {
    name: v.name,
    sku: v.sku || null,
    barcode: v.barcode ? v.barcode.replace(/\s+/g, "") : null,
    stockQty: v.stockQty === undefined ? null : String(v.stockQty),
    collection: v.collection || null,
    category: v.category || null,
    subcategory: v.subcategory || null,
    unit: v.unit || null,
    priceEur: dec(v.priceEur),
    vatRate: v.vatRate ?? 21,
    purchaseCostEur: dec(v.purchaseCostEur),
    freightCostEur: dec(v.freightCostEur),
    transportCostEur: dec(v.transportCostEur),
    otherCostEur: dec(v.otherCostEur),
    dutyPct: dec(v.dutyPct),
    targetMarginPct: dec(v.targetMarginPct),
    costEur: cost === null ? null : String(cost),
    description: v.description || null,
    imageUrl: v.imageUrl || null,
    isActive: v.isActive,
  };
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
}

export async function createProduct(formData: FormData) {
  await requireUser();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/products/new?error=validation");
  const [row] = await db.insert(products).values(toValues(parsed.data)).returning({ id: products.id });
  revalidatePath("/products");
  redirect(`/products/${row.id}/edit?saved=1`);
}

export async function updateProduct(id: string, formData: FormData) {
  await requireUser();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/products/${id}/edit?error=validation`);
  await db.update(products).set(toValues(parsed.data)).where(eq(products.id, id));
  revalidatePath("/products");
  revalidatePath(`/products/${id}/edit`);
  redirect(`/products/${id}/edit?saved=1`);
}

export async function deleteProduct(id: string) {
  await requireUser();
  await db.delete(products).where(eq(products.id, id));
  revalidatePath("/products");
  redirect("/products");
}

/** Assign an auto-generated EAN-13 barcode to a product (skips if it already has one). */
export async function generateBarcode(id: string) {
  await requireUser();
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    columns: { barcode: true },
  });
  if (!product) return;
  if (product.barcode && isValidEan13(product.barcode)) {
    redirect(`/products/${id}/edit?saved=1`);
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(products)
    .where(isNotNull(products.barcode));
  let code = nextProductBarcode(n + 1);
  // Avoid the (unlikely) collision.
  for (let i = 0; i < 50; i++) {
    const clash = await db.query.products.findFirst({
      where: eq(products.barcode, code),
      columns: { id: true },
    });
    if (!clash) break;
    code = nextProductBarcode(n + 2 + i);
  }
  await db.update(products).set({ barcode: code }).where(eq(products.id, id));
  revalidatePath("/products");
  revalidatePath(`/products/${id}/edit`);
  redirect(`/products/${id}/edit?saved=1`);
}
