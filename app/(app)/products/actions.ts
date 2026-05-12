"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

const num = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);
const int = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().int().min(0).max(100).optional(),
);

const productSchema = z.object({
  name: z.string().trim().min(1).max(300),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  collection: z.string().trim().max(120).optional().or(z.literal("")),
  category: z.string().trim().max(120).optional().or(z.literal("")),
  subcategory: z.string().trim().max(120).optional().or(z.literal("")),
  unit: z.string().trim().max(20).optional().or(z.literal("")),
  priceEur: num,
  vatRate: int,
  costEur: num,
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

function toValues(v: z.infer<typeof productSchema>) {
  return {
    name: v.name,
    sku: v.sku || null,
    collection: v.collection || null,
    category: v.category || null,
    subcategory: v.subcategory || null,
    unit: v.unit || null,
    priceEur: v.priceEur === undefined ? null : String(v.priceEur),
    vatRate: v.vatRate ?? 21,
    costEur: v.costEur === undefined ? null : String(v.costEur),
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
