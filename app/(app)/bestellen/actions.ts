"use server";

import { and, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  catalogCollections,
  catalogProducts,
  catalogVariants,
  companies,
  products,
  supplierOrderItems,
  supplierOrders,
} from "@/lib/db/schema";
import { displaySku, variantDescription } from "@/lib/catalog";
import { supplierForSku } from "@/lib/suppliers";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

const UNITS = ["stuk", "doos", "m2"] as const;
type Unit = (typeof UNITS)[number];
function parseUnit(v: FormDataEntryValue | null): Unit {
  const s = String(v ?? "stuk");
  return (UNITS as readonly string[]).includes(s) ? (s as Unit) : "stuk";
}
function parseQty(v: FormDataEntryValue | null): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(n) : "1";
}

/** Zoek een leverancier-company op naam; geef id + e-mail terug indien gevonden. */
async function resolveSupplier(name: string, emailOverride?: string | null) {
  const clean = name.trim();
  const company = clean
    ? await db.query.companies.findFirst({
        where: and(eq(companies.type, "supplier"), ilike(companies.name, clean)),
        columns: { id: true, name: true, email: true },
      })
    : null;
  return {
    supplierName: company?.name ?? clean ?? "Onbekende leverancier",
    supplierId: company?.id ?? null,
    supplierEmail: emailOverride?.trim() || company?.email || null,
  };
}

/** Vind het lopende concept van deze gebruiker voor een leverancier, of maak het aan. */
async function findOrCreateDraft(
  userId: string,
  supplier: { supplierName: string; supplierId: string | null; supplierEmail: string | null },
  customerRef: string | null,
): Promise<string> {
  const existing = await db.query.supplierOrders.findFirst({
    where: and(
      eq(supplierOrders.createdBy, userId),
      eq(supplierOrders.status, "draft"),
      ilike(supplierOrders.supplierName, supplier.supplierName),
    ),
    columns: { id: true },
  });
  if (existing) {
    if (customerRef) {
      await db
        .update(supplierOrders)
        .set({ customerRef })
        .where(eq(supplierOrders.id, existing.id));
    }
    return existing.id;
  }
  const [row] = await db
    .insert(supplierOrders)
    .values({
      createdBy: userId,
      supplierId: supplier.supplierId,
      supplierName: supplier.supplierName,
      supplierEmail: supplier.supplierEmail,
      customerRef,
      status: "draft",
    })
    .returning({ id: supplierOrders.id });
  return row.id;
}

/**
 * Voeg een regel toe aan de bestelbon. Resolvet SKU + omschrijving server-side
 * (snapshot) en routeert naar het concept van de juiste leverancier.
 */
export async function addToOrder(formData: FormData) {
  const user = await requireUser();
  const kind = String(formData.get("kind") ?? "");
  const refId = String(formData.get("refId") ?? "");
  const size = String(formData.get("size") ?? "").trim() || null;
  const qty = parseQty(formData.get("qty"));
  const unit = parseUnit(formData.get("unit"));
  const customerRef = String(formData.get("customerRef") ?? "").trim() || null;
  const supplierNameInput = String(formData.get("supplierName") ?? "").trim();
  const supplierEmailInput = String(formData.get("supplierEmail") ?? "").trim() || null;

  let sku = "";
  let description = "";
  let catalogVariantId: string | null = null;
  let productId: string | null = null;
  let defaultSupplier = supplierNameInput;

  if (kind === "catalog") {
    const [v] = await db
      .select({
        id: catalogVariants.id,
        sku: catalogVariants.sku,
        legacySku: catalogVariants.legacySku,
        color: catalogVariants.colorNameEn,
        productName: catalogProducts.nameEn,
        collectionName: catalogCollections.nameEn,
      })
      .from(catalogVariants)
      .leftJoin(catalogProducts, eq(catalogVariants.productId, catalogProducts.id))
      .leftJoin(catalogCollections, eq(catalogProducts.collectionId, catalogCollections.id))
      .where(eq(catalogVariants.id, refId))
      .limit(1);
    if (!v) throw new Error("Catalogusvariant niet gevonden.");
    catalogVariantId = v.id;
    sku = displaySku(v);
    description = variantDescription({
      collection: v.collectionName,
      product: v.productName,
      color: v.color,
      size,
    });
    if (!defaultSupplier) defaultSupplier = "Magic Stone";
  } else if (kind === "product") {
    const p = await db.query.products.findFirst({
      where: eq(products.id, refId),
      columns: { id: true, name: true, sku: true, collection: true },
    });
    if (!p) throw new Error("Product niet gevonden.");
    productId = p.id;
    sku = p.sku ?? "—";
    description = [p.collection, p.name].filter(Boolean).join(" · ");
    // Leverancier afleiden uit de SKU-prefix als die niet is opgegeven.
    if (!defaultSupplier) defaultSupplier = supplierForSku(p.sku);
  } else {
    throw new Error("Ongeldig type.");
  }

  if (!defaultSupplier) defaultSupplier = "Onbekende leverancier";

  const supplier = await resolveSupplier(defaultSupplier, supplierEmailInput);
  const orderId = await findOrCreateDraft(user.id, supplier, customerRef);

  await db.insert(supplierOrderItems).values({
    orderId,
    catalogVariantId,
    productId,
    size,
    qty,
    unit,
    skuSnapshot: sku,
    description,
  });

  revalidatePath("/bestellen");
  redirect("/bestellen");
}

export async function updateOrderItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db
    .update(supplierOrderItems)
    .set({
      qty: parseQty(formData.get("qty")),
      unit: parseUnit(formData.get("unit")),
      size: String(formData.get("size") ?? "").trim() || null,
    })
    .where(eq(supplierOrderItems.id, id));
  revalidatePath("/bestellen");
}

export async function removeOrderItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db.delete(supplierOrderItems).where(eq(supplierOrderItems.id, id));
  revalidatePath("/bestellen");
}

export async function updateOrderMeta(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db
    .update(supplierOrders)
    .set({
      customerRef: String(formData.get("customerRef") ?? "").trim() || null,
      supplierEmail: String(formData.get("supplierEmail") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .where(eq(supplierOrders.id, id));
  revalidatePath("/bestellen");
  revalidatePath(`/bestellen/${id}`);
}

export async function markOrderSent(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db
    .update(supplierOrders)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(supplierOrders.id, id));
  revalidatePath("/bestellen");
  revalidatePath(`/bestellen/${id}`);
}

export async function reopenOrder(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db
    .update(supplierOrders)
    .set({ status: "draft", sentAt: null })
    .where(eq(supplierOrders.id, id));
  revalidatePath("/bestellen");
  revalidatePath(`/bestellen/${id}`);
}

export async function deleteOrder(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Ontbrekende id.");
  await db.delete(supplierOrders).where(eq(supplierOrders.id, id));
  revalidatePath("/bestellen");
  redirect("/bestellen");
}

/** Zoek producten + catalogusvarianten voor de bestelpagina (server action). */
export async function searchOrderable(term: string) {
  await requireUser();
  const q = term.trim();
  if (q.length < 2) return { products: [], variants: [] };

  const [prod, vars] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        collection: products.collection,
        imageUrl: products.imageUrl,
      })
      .from(products)
      .where(
        sql`(${products.name} ilike ${"%" + q + "%"} or ${products.sku} ilike ${"%" + q + "%"})`,
      )
      .limit(15),
    db
      .select({
        id: catalogVariants.id,
        sku: catalogVariants.sku,
        legacySku: catalogVariants.legacySku,
        color: catalogVariants.colorNameEn,
        productName: catalogProducts.nameEn,
        collectionName: catalogCollections.nameEn,
      })
      .from(catalogVariants)
      .leftJoin(catalogProducts, eq(catalogVariants.productId, catalogProducts.id))
      .leftJoin(catalogCollections, eq(catalogProducts.collectionId, catalogCollections.id))
      .where(
        sql`(${catalogVariants.sku} ilike ${"%" + q + "%"} or ${catalogVariants.legacySku} ilike ${"%" + q + "%"} or ${catalogVariants.colorNameEn} ilike ${"%" + q + "%"} or ${catalogProducts.nameEn} ilike ${"%" + q + "%"})`,
      )
      .limit(15),
  ]);

  return { products: prod, variants: vars };
}
