"use server";

/**
 * Uitvoeringen van een product beheren (kleur, model, maat).
 *
 * Bewust een eigen bestand naast actions.ts: het productformulier blijft
 * ongewijzigd voor de bestaande producten, en de uitvoeringen krijgen hun eigen
 * kaart met een eigen submit. Na élke wijziging wordt
 * `products.additionalSizes` opnieuw afgeleid (lib/variants-sync.ts), want dát
 * veld leest de rest van het CRM.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireWriteUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { brands, productVariants, products } from "@/lib/db/schema";
import { deleteBrandLogoByUrl, uploadVariantImage } from "@/lib/storage";
import {
  buildVariantLabel,
  buildVariantSku,
  inkoopUitKorting,
  normalizeCode,
  optionProblems,
} from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";

const getal = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);

const asSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  values: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(60),
        label: z.string().trim().min(1).max(120),
        // Het kleine plaatje bij de keuze (kleurstaal, tekeningetje wandarm).
        imageUrl: z.string().trim().max(600).nullable().optional(),
      }),
    )
    .default([]),
});

const rijSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  code: z.string().trim().max(80),
  options: z.record(z.string(), z.string()).default({}),
  priceEur: getal,
  discountPct: getal,
  purchaseCostEur: getal,
  imageUrl: z.string().trim().max(600).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

const jsonVeld = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== "string" || !v.trim()) return [];
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }, schema);

const matrixSchema = z.object({
  optionAxes: jsonVeld(z.array(asSchema).default([])),
  variants: jsonVeld(z.array(rijSchema).default([])),
});

const dec = (v: number | null | undefined) => (v == null ? null : String(v));

/**
 * De hele matrix in één keer opslaan: assen, uitvoeringen en wat er weg moet.
 *
 * Rijen zonder code tellen niet mee — de generator stelt alle combinaties voor,
 * maar niet elke combinatie bestaat echt (Brauer verkoopt niet elke hendel in
 * elke kleur), dus een voorstel zonder artikelcode wordt geen uitvoering.
 */
export async function saveVariants(productId: string, formData: FormData) {
  await requireWriteUser();
  const terug = (q: string) => redirect(`/products/${productId}/edit?${q}#uitvoeringen`);

  const parsed = matrixSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) terug("error=variants");

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true, brandId: true },
  });
  if (!product) terug("error=variants");

  const merk = product!.brandId
    ? await db.query.brands.findFirst({
        where: eq(brands.id, product!.brandId),
        columns: { skuPrefix: true, dealerDiscountPct: true },
      })
    : null;

  const assen = parsed.data!.optionAxes;
  const ingevuld = parsed.data!.variants.filter((r) => normalizeCode(r.code) !== "");

  // Dubbele codes binnen dit ene formulier: dat is een typefout, geen conflict
  // dat we stilletjes moeten oplossen.
  const gezien = new Set<string>();
  for (const r of ingevuld) {
    const c = normalizeCode(r.code);
    if (gezien.has(c)) terug(`error=dubbel&code=${encodeURIComponent(c)}`);
    gezien.add(c);
  }

  // Dezelfde code bij een ánder product van hetzelfde merk zou de unieke index
  // laten klappen; liever een leesbare melding dan een 500.
  if (product!.brandId && ingevuld.length) {
    const bezet = await db
      .select({ code: productVariants.code })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.brandId, product!.brandId),
          ne(productVariants.productId, productId),
          inArray(productVariants.code, [...gezien]),
        ),
      );
    if (bezet.length) terug(`error=bezet&code=${encodeURIComponent(bezet[0].code)}`);
  }

  for (const r of ingevuld) {
    if (optionProblems(assen, r.options).length) terug("error=opties");
  }

  const bestaand = await db
    .select({ id: productVariants.id, imageUrl: productVariants.imageUrl })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  const behouden = new Set(ingevuld.map((r) => r.id).filter(Boolean));
  const weg = bestaand.filter((b) => !behouden.has(b.id));

  const standaardKorting = merk?.dealerDiscountPct == null ? undefined : Number(merk.dealerDiscountPct);

  let volgorde = 0;
  for (const r of ingevuld) {
    const code = normalizeCode(r.code);
    const korting = r.discountPct ?? standaardKorting;
    const waarden = {
      productId,
      brandId: product!.brandId,
      code,
      sku: buildVariantSku(merk?.skuPrefix, code),
      label: buildVariantLabel(assen, r.options) || code,
      options: r.options,
      priceEur: dec(r.priceEur),
      listPriceEur: dec(r.priceEur),
      discountPct: dec(korting),
      purchaseCostEur: dec(r.purchaseCostEur ?? inkoopUitKorting(r.priceEur, korting)),
      costEur: dec(r.purchaseCostEur ?? inkoopUitKorting(r.priceEur, korting)),
      imageUrl: r.imageUrl || null,
      isActive: r.isActive,
      sortOrder: volgorde++,
      updatedAt: new Date(),
    };
    if (r.id) await db.update(productVariants).set(waarden).where(eq(productVariants.id, r.id));
    else await db.insert(productVariants).values(waarden);
  }

  if (weg.length) {
    await db.delete(productVariants).where(
      inArray(
        productVariants.id,
        weg.map((w) => w.id),
      ),
    );
    for (const w of weg) if (w.imageUrl) await deleteBrandLogoByUrl(w.imageUrl);
  }

  await db
    .update(products)
    .set({ optionAxes: assen.length ? assen : null, updatedAt: new Date() })
    .where(eq(products.id, productId));
  await syncVariantProjection(productId);

  revalidatePath("/products");
  revalidatePath(`/products/${productId}/edit`);
  terug("saved=1");
}

/** Foto van één uitvoering — de reden dat kleuren een eigen rij hebben. */
export async function uploadVariantPhoto(variantId: string, formData: FormData) {
  await requireWriteUser();
  const variant = await db.query.productVariants.findFirst({
    where: eq(productVariants.id, variantId),
    columns: { id: true, productId: true, imageUrl: true },
  });
  if (!variant) redirect("/products");

  const file = formData.get("foto");
  const terug = (q: string) => redirect(`/products/${variant!.productId}/edit?${q}#uitvoeringen`);
  if (!(file instanceof File) || file.size === 0) terug("error=upload");

  let url: string;
  try {
    url = await uploadVariantImage(variantId, file as File);
  } catch {
    terug("error=upload");
  }
  await db
    .update(productVariants)
    .set({ imageUrl: url!, updatedAt: new Date() })
    .where(eq(productVariants.id, variantId));
  if (variant!.imageUrl) await deleteBrandLogoByUrl(variant!.imageUrl);
  await syncVariantProjection(variant!.productId);
  revalidatePath(`/products/${variant!.productId}/edit`);
  terug("saved=1");
}
