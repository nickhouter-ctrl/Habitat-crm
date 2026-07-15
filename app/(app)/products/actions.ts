"use server";

import { count, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import corneliusData from "@/lib/import/cornelius-products.json";
import { isValidEan13, nextProductBarcode } from "@/lib/barcode";
import { hasCostBreakdown, landedCost } from "@/lib/pricing";
import { deleteProductImageByUrl, uploadProductImage } from "@/lib/storage";
import { pushProductToWebsite } from "@/lib/website/push";

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
  stockMin: qty,
  collection: z.string().trim().max(120).optional().or(z.literal("")),
  category: z.string().trim().max(120).optional().or(z.literal("")),
  subcategory: z.string().trim().max(120).optional().or(z.literal("")),
  unit: z.string().trim().max(20).optional().or(z.literal("")),
  priceEur: num,
  tradePriceEur: num,
  vatRate: int,
  purchaseCostEur: num,
  freightCostEur: num,
  transportCostEur: num,
  otherCostEur: num,
  dutyPct: pct,
  targetMarginPct: pct,
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  widthMm: num,
  heightMm: num,
  lengthMm: num,
  thicknessMm: num,
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  pushToWebsite: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  additionalSizes: z.preprocess(
    (v) => {
      if (typeof v !== "string" || !v.trim()) return [];
      try {
        const a = JSON.parse(v);
        return Array.isArray(a) ? a : [];
      } catch {
        return [];
      }
    },
    z
      .array(
        z.object({
          sku: z.string().trim().default(""),
          label: z.string().trim().default(""),
          priceEur: z.number().nonnegative().nullable().optional(),
          purchaseEur: z.number().nonnegative().nullable().optional(),
          costEur: z.number().nonnegative().nullable().optional(),
          stockQty: z.number().nonnegative().nullable().optional(),
          inStock: z.boolean().optional(),
        }),
      )
      .default([]),
  ),
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
    stockMin: v.stockMin === undefined ? null : String(v.stockMin),
    collection: v.collection || null,
    category: v.category || null,
    subcategory: v.subcategory || null,
    unit: v.unit || null,
    priceEur: dec(v.priceEur),
    // Aannemersprijs = vaste regel: altijd 20% onder de verkoopprijs.
    // Leeg gelaten → automatisch op showroom × 0,80 (afgerond op centen).
    tradePriceEur:
      dec(v.tradePriceEur) ??
      (v.priceEur !== undefined ? String(Math.round(v.priceEur * 0.8 * 100) / 100) : null),
    vatRate: v.vatRate ?? 21,
    purchaseCostEur: dec(v.purchaseCostEur),
    freightCostEur: dec(v.freightCostEur),
    transportCostEur: dec(v.transportCostEur),
    otherCostEur: dec(v.otherCostEur),
    dutyPct: dec(v.dutyPct),
    targetMarginPct: dec(v.targetMarginPct),
    costEur: cost === null ? null : String(cost),
    description: v.description || null,
    widthMm: dec(v.widthMm),
    heightMm: dec(v.heightMm),
    lengthMm: dec(v.lengthMm),
    thicknessMm: dec(v.thicknessMm),
    imageUrl: v.imageUrl || null,
    isActive: v.isActive,
    pushToWebsite: v.pushToWebsite,
    additionalSizes: v.additionalSizes.length ? v.additionalSizes : null,
  };
}

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
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

type CorneliusItem = {
  name: string;
  sku: string;
  priceEur: number | null;
  category: string;
  imageUrl: string | null;
  description: string | null;
  sourceUrl: string | null;
};

/**
 * Bulk-import van de Cornelius Lifestyle-catalogus (lib/import/cornelius-products.json).
 * Alles komt binnen als "op bestelling" (telt nooit mee in voorraad). Idempotent:
 * producten waarvan de SKU al bestaat worden overgeslagen, zodat nogmaals klikken
 * geen dubbele aanmaakt. Verkoopprijs = de Cornelius-prijs; aannemersprijs −20%.
 */
export async function importCorneliusProducts(): Promise<{
  added: number;
  skipped: number;
  total: number;
}> {
  await requireUser();
  const items = corneliusData as CorneliusItem[];

  // Indeling: collection "Meubels" → category (groep) → subcategory (type).
  const GROUP: Record<string, string> = {
    Armchairs: "Seating", Sofas: "Seating", Chairs: "Seating", "Dining Chairs": "Seating",
    Barstools: "Seating", Benches: "Seating", Poufs: "Seating",
    "Coffee Tables": "Tables", "Dining Tables": "Tables", "Console Tables": "Tables", "Side Tables": "Tables",
    Chandeliers: "Lighting", Pendants: "Lighting", "Floor Lamps": "Lighting",
    Trees: "Decoration", Artwork: "Decoration",
  };
  const SUBCAT: Record<string, string> = { Trees: "Real Touch Trees and Plants" };

  const existing = await db
    .select({ sku: products.sku })
    .from(products)
    .where(isNotNull(products.sku));
  const have = new Set(existing.map((r) => (r.sku ?? "").trim()).filter(Boolean));

  const toInsert = items.filter((p) => p.sku && !have.has(p.sku.trim()));

  const rows = toInsert.map((p) => ({
    name: p.name,
    sku: p.sku,
    collection: "Meubels",
    category: GROUP[p.category] ?? "Overig",
    subcategory: SUBCAT[p.category] ?? p.category ?? null,
    unit: "stuk",
    priceEur: p.priceEur != null ? String(p.priceEur) : null,
    // Meubels: geen aannemerskorting → aannemersprijs = verkoopprijs.
    tradePriceEur: p.priceEur != null ? String(p.priceEur) : null,
    vatRate: 21,
    description: p.description || null,
    imageUrl: p.imageUrl || null,
    availability: "order_only" as const,
    isActive: true,
    pushToWebsite: false,
  }));

  let added = 0;
  for (let i = 0; i < rows.length; i += 50) {
    await db.insert(products).values(rows.slice(i, i + 50));
    added += Math.min(50, rows.length - i);
  }

  revalidatePath("/products");
  return { added, skipped: items.length - toInsert.length, total: items.length };
}

export async function deleteProduct(id: string) {
  await requireUser();
  await db.delete(products).where(eq(products.id, id));
  revalidatePath("/products");
  redirect("/products");
}

/**
 * Upload of vervang de foto van een product. Verwijdert de oude foto uit
 * Supabase als die ook door ons gehost was (vreemde URL's laten we staan).
 */
export async function uploadProductPhoto(id: string, formData: FormData) {
  await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/products/${id}/edit?error=upload`);
  }
  const existing = await db.query.products.findFirst({
    where: eq(products.id, id),
    columns: { imageUrl: true },
  });
  const url = await uploadProductImage(id, file as File);
  if (existing?.imageUrl) await deleteProductImageByUrl(existing.imageUrl);
  await db.update(products).set({ imageUrl: url, updatedAt: new Date() }).where(eq(products.id, id));
  revalidatePath("/products");
  revalidatePath(`/products/${id}/edit`);
  redirect(`/products/${id}/edit?saved=1`);
}

/** Verwijder de gehoste foto van een product (zet imageUrl op null). */
export async function removeProductPhoto(id: string) {
  await requireUser();
  const existing = await db.query.products.findFirst({
    where: eq(products.id, id),
    columns: { imageUrl: true },
  });
  if (existing?.imageUrl) await deleteProductImageByUrl(existing.imageUrl);
  await db.update(products).set({ imageUrl: null, updatedAt: new Date() }).where(eq(products.id, id));
  revalidatePath("/products");
  revalidatePath(`/products/${id}/edit`);
  redirect(`/products/${id}/edit?saved=1`);
}

/**
 * Push dit product nu naar habitat-one via één GitHub-commit (atomic).
 * De website re-deployt zelf na de push.
 */
export async function pushProductToWebsiteAction(id: string) {
  await requireUser();
  let target: string;
  try {
    const r = await pushProductToWebsite(id);
    const sp = new URLSearchParams({
      pushed: r.action,
      websiteId: String(r.websiteProductId),
      commit: r.commitSha.slice(0, 7),
    });
    target = `/products/${id}/edit?${sp.toString()}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "push mislukt";
    target = `/products/${id}/edit?pushError=${encodeURIComponent(msg)}`;
  }
  revalidatePath("/products");
  revalidatePath(`/products/${id}/edit`);
  redirect(target);
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
