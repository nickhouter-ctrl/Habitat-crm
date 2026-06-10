"use server";

import { and, eq, ilike, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  catalogCollections,
  catalogProducts,
  catalogVariants,
  catalogVariantSizes,
  products,
} from "@/lib/db/schema";
import { nextCatalogSku } from "@/lib/catalog";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

const money = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);
const intPos = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().int().nonnegative().optional(),
);
const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

function moneyStr(n: number | undefined): string | null {
  return n === undefined ? null : String(n);
}

/* ----------------------------------------------------------------- collecties */

export async function createCollection(formData: FormData) {
  await requireUser();
  const nameEn = String(formData.get("nameEn") ?? "").trim();
  if (!nameEn) throw new Error("Naam (EN) is verplicht.");
  await db.insert(catalogCollections).values({
    nameEn,
    nameCn: String(formData.get("nameCn") ?? "").trim() || null,
    sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
  });
  revalidatePath("/samplecatalogus");
  revalidatePath("/samplecatalogus/beheer");
}

export async function updateCollection(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db
    .update(catalogCollections)
    .set({
      nameEn: String(formData.get("nameEn") ?? "").trim(),
      nameCn: String(formData.get("nameCn") ?? "").trim() || null,
      sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
    })
    .where(eq(catalogCollections.id, id));
  revalidatePath("/samplecatalogus");
  revalidatePath("/samplecatalogus/beheer");
}

export async function deleteCollection(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db.delete(catalogCollections).where(eq(catalogCollections.id, id));
  revalidatePath("/samplecatalogus");
  revalidatePath("/samplecatalogus/beheer");
}

/* ------------------------------------------------------------------- producten */

export async function createCatalogProduct(formData: FormData) {
  await requireUser();
  const collectionId = String(formData.get("collectionId") ?? "");
  const nameEn = String(formData.get("nameEn") ?? "").trim();
  if (!collectionId) throw new Error("Kies een collectie.");
  if (!nameEn) throw new Error("Naam (EN) is verplicht.");
  await db.insert(catalogProducts).values({
    collectionId,
    nameEn,
    nameCn: String(formData.get("nameCn") ?? "").trim() || null,
    sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
  });
  revalidatePath("/samplecatalogus");
  revalidatePath("/samplecatalogus/beheer");
}

export async function updateCatalogProduct(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db
    .update(catalogProducts)
    .set({
      collectionId: String(formData.get("collectionId") ?? "") || undefined,
      nameEn: String(formData.get("nameEn") ?? "").trim(),
      nameCn: String(formData.get("nameCn") ?? "").trim() || null,
      sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
    })
    .where(eq(catalogProducts.id, id));
  revalidatePath("/samplecatalogus");
  revalidatePath("/samplecatalogus/beheer");
}

export async function deleteCatalogProduct(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db.delete(catalogProducts).where(eq(catalogProducts.id, id));
  revalidatePath("/samplecatalogus");
  revalidatePath("/samplecatalogus/beheer");
}

/* -------------------------------------------------------------------- varianten */

const variantSchema = z.object({
  productId: z.string().min(1),
  colorNameEn: z.string().trim().min(1).max(200),
  colorNameCn: z.string().trim().max(200).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  hasSample: bool,
  inRange: bool,
  salePrice: money,
  supplierPrice: money,
  status: z.enum(["sample_only", "available", "discontinued"]).default("sample_only"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Nieuwe variant. SKU wordt automatisch gegenereerd (MS-###). */
export async function createVariant(formData: FormData) {
  await requireUser();
  const parsed = variantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  const sku = await nextCatalogSku();
  const [row] = await db
    .insert(catalogVariants)
    .values({
      productId: d.productId,
      sku,
      colorNameEn: d.colorNameEn,
      colorNameCn: d.colorNameCn || null,
      imageUrl: d.imageUrl || null,
      hasSample: d.hasSample,
      inRange: d.inRange,
      salePrice: moneyStr(d.salePrice),
      supplierPrice: moneyStr(d.supplierPrice),
      status: d.status,
      notes: d.notes || null,
    })
    .returning({ id: catalogVariants.id });
  revalidatePath("/samplecatalogus");
  redirect(`/samplecatalogus/${row.id}`);
}

export async function updateVariant(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  const parsed = variantSchema.partial().safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db
    .update(catalogVariants)
    .set({
      colorNameEn: d.colorNameEn,
      colorNameCn: d.colorNameCn || null,
      imageUrl: d.imageUrl || null,
      hasSample: d.hasSample,
      inRange: d.inRange,
      salePrice: d.salePrice === undefined ? undefined : moneyStr(d.salePrice),
      supplierPrice: d.supplierPrice === undefined ? undefined : moneyStr(d.supplierPrice),
      status: d.status,
      notes: d.notes || null,
    })
    .where(eq(catalogVariants.id, id));
  revalidatePath(`/samplecatalogus/${id}`);
  revalidatePath("/samplecatalogus");
}

export async function deleteVariant(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db.delete(catalogVariants).where(eq(catalogVariants.id, id));
  revalidatePath("/samplecatalogus");
  redirect("/samplecatalogus");
}

/** Snel een vinkje togglen vanuit de lijst/detail. */
export async function toggleVariantFlag(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "") === "true";
  if (!id || (field !== "hasSample" && field !== "inRange")) throw new Error("Ongeldig.");
  await db
    .update(catalogVariants)
    .set({ [field]: value })
    .where(eq(catalogVariants.id, id));
  revalidatePath(`/samplecatalogus/${id}`);
  revalidatePath("/samplecatalogus");
}

/** Verkoop-/inkoopprijs op variantniveau (fallback). */
export async function updateVariantPricing(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  const sale = money.parse(formData.get("salePrice"));
  const supplier = money.parse(formData.get("supplierPrice"));
  await db
    .update(catalogVariants)
    .set({ salePrice: moneyStr(sale), supplierPrice: moneyStr(supplier) })
    .where(eq(catalogVariants.id, id));
  revalidatePath(`/samplecatalogus/${id}`);
}

/* ----------------------------------------------------------------------- maten */

export async function addSize(formData: FormData) {
  await requireUser();
  const variantId = String(formData.get("variantId") ?? "");
  const productSize = String(formData.get("productSize") ?? "").trim();
  if (!variantId || !productSize) throw new Error("Maat is verplicht.");
  await db.insert(catalogVariantSizes).values({
    variantId,
    productSize,
    thicknessMm: String(formData.get("thicknessMm") ?? "").trim() || null,
    sqmPerBox: moneyStr(money.parse(formData.get("sqmPerBox"))),
    pcsPerBox: intPos.parse(formData.get("pcsPerBox")) ?? null,
    kgPerBox: String(formData.get("kgPerBox") ?? "").trim() || null,
    salePrice: moneyStr(money.parse(formData.get("salePrice"))),
    supplierPrice: moneyStr(money.parse(formData.get("supplierPrice"))),
    sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
  });
  revalidatePath(`/samplecatalogus/${variantId}`);
}

export async function updateSize(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db
    .update(catalogVariantSizes)
    .set({
      productSize: String(formData.get("productSize") ?? "").trim(),
      thicknessMm: String(formData.get("thicknessMm") ?? "").trim() || null,
      sqmPerBox: moneyStr(money.parse(formData.get("sqmPerBox"))),
      pcsPerBox: intPos.parse(formData.get("pcsPerBox")) ?? null,
      kgPerBox: String(formData.get("kgPerBox") ?? "").trim() || null,
      salePrice: moneyStr(money.parse(formData.get("salePrice"))),
      supplierPrice: moneyStr(money.parse(formData.get("supplierPrice"))),
      sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
    })
    .where(eq(catalogVariantSizes.id, id));
  revalidatePath(`/samplecatalogus/${variantId}`);
}

export async function deleteSize(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db.delete(catalogVariantSizes).where(eq(catalogVariantSizes.id, id));
  revalidatePath(`/samplecatalogus/${variantId}`);
}

/* ---------------------------------------------------------- matching met products */

/**
 * Koppel een catalogusvariant aan een bestaand product. Neemt de bestaande SKU
 * over (legacy_sku = product.sku) zónder de bestaande SKU te wijzigen, en zet
 * in_range = true + status = available. De interne `sku` van de variant wordt
 * gelijkgetrokken met de bestaande SKU als die er is.
 */
export async function matchVariant(formData: FormData) {
  await requireUser();
  const variantId = String(formData.get("variantId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!variantId || !productId) throw new Error("Variant en product zijn verplicht.");

  const prod = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true, sku: true, priceEur: true },
  });
  if (!prod) throw new Error("Product niet gevonden.");

  const set: Record<string, unknown> = {
    existingProductId: prod.id,
    inRange: true,
    status: "available",
  };
  if (prod.sku) {
    set.legacySku = prod.sku;
    set.sku = prod.sku; // bestaande SKU overnemen — wijzigt de productrecord niet
  }
  // verkoopprijs voorinvullen vanuit het product als de variant er nog geen heeft
  if (prod.priceEur) {
    const v = await db.query.catalogVariants.findFirst({
      where: eq(catalogVariants.id, variantId),
      columns: { salePrice: true },
    });
    if (!v?.salePrice) set.salePrice = prod.priceEur;
  }

  await db.update(catalogVariants).set(set).where(eq(catalogVariants.id, variantId));
  revalidatePath(`/samplecatalogus/${variantId}`);
  revalidatePath("/samplecatalogus/match");
}

/** Koppeling ongedaan maken. */
export async function unmatchVariant(formData: FormData) {
  await requireUser();
  const variantId = String(formData.get("variantId") ?? "");
  if (!variantId) throw new Error("Ontbrekende id.");
  await db
    .update(catalogVariants)
    .set({ existingProductId: null, legacySku: null, inRange: false, status: "sample_only" })
    .where(eq(catalogVariants.id, variantId));
  revalidatePath(`/samplecatalogus/${variantId}`);
  revalidatePath("/samplecatalogus/match");
}

/** Zoek kandidaat-producten voor de match (server action voor het matchscherm). */
export async function searchProducts(term: string) {
  await requireUser();
  const q = term.trim();
  if (!q) return [];
  return db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      collection: products.collection,
      category: products.category,
    })
    .from(products)
    .where(
      and(
        isNotNull(products.sku),
        ilike(products.name, `%${q}%`),
      ),
    )
    .limit(20);
}
