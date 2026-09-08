"use server";

/**
 * Merken die we voeren. Een merk draagt zijn logo, zijn dealerkorting en zijn
 * brochures — dingen die je één keer vastlegt en die de productimport nodig
 * heeft. Zie lib/db/schema.ts (`brands`).
 */
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireWriteUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { brands, products, type CatalogAttachment } from "@/lib/db/schema";
import { deleteBrandLogoByUrl, uploadBrandLogo } from "@/lib/storage";

const pct = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().min(0).max(100).optional(),
);

const brandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(120).optional().or(z.literal("")),
  websiteUrl: z.string().trim().url().optional().or(z.literal("")),
  skuPrefix: z.string().trim().max(10).optional().or(z.literal("")),
  supplierName: z.string().trim().max(200).optional().or(z.literal("")),
  dealerDiscountPct: pct,
  tradeDiscountPct: pct,
  defaultVatRate: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(0).max(100).optional(),
  ),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

/** "BRAUER" → "brauer"; botsende slugs krijgen een volgnummer. */
function slugify(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

async function vrijeSlug(gewenst: string, negeerId?: string): Promise<string> {
  const basis = slugify(gewenst) || "merk";
  const bezet = new Set(
    (await db.select({ slug: brands.slug, id: brands.id }).from(brands))
      .filter((b) => b.id !== negeerId)
      .map((b) => b.slug),
  );
  if (!bezet.has(basis)) return basis;
  for (let i = 2; i < 100; i++) if (!bezet.has(`${basis}-${i}`)) return `${basis}-${i}`;
  return `${basis}-${Date.now()}`;
}

const dec = (v: number | undefined) => (v === undefined ? null : String(v));

function toValues(v: z.infer<typeof brandSchema>, slug: string) {
  return {
    name: v.name,
    slug,
    websiteUrl: v.websiteUrl || null,
    skuPrefix: v.skuPrefix ? v.skuPrefix.toUpperCase().replace(/-+$/, "") : null,
    supplierName: v.supplierName || null,
    dealerDiscountPct: dec(v.dealerDiscountPct),
    tradeDiscountPct: dec(v.tradeDiscountPct),
    defaultVatRate: v.defaultVatRate ?? 21,
    notes: v.notes || null,
    isActive: v.isActive,
  };
}

export async function createBrand(formData: FormData) {
  await requireWriteUser();
  const parsed = brandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/merken/new?error=validation");
  const slug = await vrijeSlug(parsed.data.slug || parsed.data.name);
  const [rij] = await db
    .insert(brands)
    .values(toValues(parsed.data, slug))
    .returning({ id: brands.id });
  revalidatePath("/merken");
  redirect(`/merken/${rij.id}?saved=1`);
}

export async function updateBrand(id: string, formData: FormData) {
  await requireWriteUser();
  const parsed = brandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/merken/${id}?error=validation`);
  const slug = await vrijeSlug(parsed.data.slug || parsed.data.name, id);
  await db
    .update(brands)
    .set({ ...toValues(parsed.data, slug), updatedAt: new Date() })
    .where(eq(brands.id, id));
  revalidatePath("/merken");
  revalidatePath(`/merken/${id}`);
  redirect(`/merken/${id}?saved=1`);
}

export async function uploadBrandLogoAction(id: string, formData: FormData) {
  await requireWriteUser();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) redirect(`/merken/${id}?error=upload`);
  const huidig = await db.query.brands.findFirst({ where: eq(brands.id, id), columns: { logoUrl: true } });
  let url: string;
  try {
    url = await uploadBrandLogo(id, file);
  } catch {
    redirect(`/merken/${id}?error=upload`);
  }
  await db.update(brands).set({ logoUrl: url, updatedAt: new Date() }).where(eq(brands.id, id));
  // Pas opruimen als de nieuwe er staat, anders raak je bij een fout beide kwijt.
  if (huidig?.logoUrl) await deleteBrandLogoByUrl(huidig.logoUrl);
  revalidatePath("/merken");
  revalidatePath(`/merken/${id}`);
  redirect(`/merken/${id}?saved=1`);
}

export async function removeBrandLogo(id: string) {
  await requireWriteUser();
  const rij = await db.query.brands.findFirst({ where: eq(brands.id, id), columns: { logoUrl: true } });
  await db.update(brands).set({ logoUrl: null, updatedAt: new Date() }).where(eq(brands.id, id));
  if (rij?.logoUrl) await deleteBrandLogoByUrl(rij.logoUrl);
  revalidatePath(`/merken/${id}`);
  redirect(`/merken/${id}?saved=1`);
}

/**
 * Een merk verwijderen kan alleen als er geen producten aan hangen — anders
 * zouden die stilletjes hun merk kwijtraken (de FK staat op set null).
 */
export async function deleteBrand(id: string) {
  await requireWriteUser();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.brandId, id));
  if (n > 0) redirect(`/merken/${id}?error=inuse`);
  await db.delete(brands).where(eq(brands.id, id));
  revalidatePath("/merken");
  redirect("/merken");
}

/** Bijlagen (brochures, prijslijsten) bij een merk registreren na een upload. */
export async function attachBrandFiles(id: string, bestanden: CatalogAttachment[]) {
  await requireWriteUser();
  const veilig = bestanden.filter((f) => f.path.startsWith(`brands/${id}/`));
  if (!veilig.length) return;
  const rij = await db.query.brands.findFirst({ where: eq(brands.id, id), columns: { attachments: true } });
  await db
    .update(brands)
    .set({ attachments: [...(rij?.attachments ?? []), ...veilig], updatedAt: new Date() })
    .where(eq(brands.id, id));
  revalidatePath(`/merken/${id}`);
}
