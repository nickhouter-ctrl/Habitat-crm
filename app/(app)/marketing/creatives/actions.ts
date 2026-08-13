"use server";

/**
 * Server actions voor de creative-editor (brief §7).
 *
 * - `createCreativeSpec` — één spec opslaan als concept
 * - `createCreativeSet` — "Maak set": 3 formaten × 4 talen uit één handeling,
 *   met per taal de copy uit de tekstblokken (gelijkwaardige talen, §8c)
 * - `approveCreative` — poortwachter: alleen `approved` als de layoutvalidatie
 *   slaagt ÉN de menselijke controlelijst is afgevinkt (§6b: geen vinkje,
 *   geen approved)
 * - `archiveCreative` — concept of goedgekeurde spec archiveren
 *
 * Wijzigen betekent dupliceren (§3.5): er is bewust geen update-actie voor
 * copy — de editor maakt een nieuwe spec met `parentId`.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireWriteUser } from "@/lib/auth/guards";
import { creativeSpecSchema } from "@/lib/creatives/schema";
import { validateSpecCopy } from "@/lib/creatives/validate";
import { FORMAT_NAMES } from "@/lib/creatives/tokens";
import { db } from "@/lib/db";
import { assets, copyBlocks, creativeSpecs, products } from "@/lib/db/schema";
import {
  resolveCopyPrefill,
  type CreativeLocale,
  type ProductTokens,
} from "@/components/marketing/creatives/prefill";

const LOCALES = ["nl", "en", "es", "de"] as const;

/** Payload uit de editor: een CreativeSpec mét verplichte asset + herkomst. */
const payloadSchema = creativeSpecSchema.extend({
  assetId: z.uuid("Kies eerst een beeld uit de bibliotheek."),
  parentId: z.uuid().nullish(),
});

export interface EditorActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function parsePayload(formData: FormData):
  | { ok: true; value: z.infer<typeof payloadSchema> }
  | { ok: false; state: EditorActionState } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, state: { error: "De ingevulde gegevens konden niet worden gelezen. Herlaad de pagina en probeer opnieuw." } };
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      ok: false,
      state: {
        error: "De spec is niet compleet of ongeldig. Controleer de gemarkeerde velden.",
        fieldErrors: flat.fieldErrors as Record<string, string[]>,
      },
    };
  }
  return { ok: true, value: parsed.data };
}

/** Controleer dat het beeld echt in de bibliotheek staat (geen vrije uuid's). */
async function assertAssetExists(assetId: string): Promise<boolean> {
  const [row] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId)).limit(1);
  return !!row;
}

/** Sla één spec op als concept en ga naar de detailpagina. */
export async function createCreativeSpec(
  _prev: EditorActionState,
  formData: FormData,
): Promise<EditorActionState> {
  const user = await requireWriteUser();
  const parsed = parsePayload(formData);
  if (!parsed.ok) return parsed.state;
  const spec = parsed.value;

  if (!(await assertAssetExists(spec.assetId))) {
    return { error: "Het gekozen beeld bestaat niet (meer) in de bibliotheek. Kies een ander beeld." };
  }

  const [row] = await db
    .insert(creativeSpecs)
    .values({
      productId: spec.productId ?? null,
      assetId: spec.assetId,
      template: spec.template,
      palette: spec.palette,
      format: spec.format,
      locale: spec.locale,
      copy: spec.copy,
      copyAngle: spec.copyAngle ?? null,
      status: "draft",
      parentId: spec.parentId ?? null,
      createdBy: user.email ?? user.name ?? user.id,
    })
    .returning({ id: creativeSpecs.id });

  revalidatePath("/marketing/creatives");
  redirect(`/marketing/creatives/${row.id}`);
}

/**
 * "Maak set": genereer 3 formaten × 4 talen als aparte specs — twaalf
 * bestanden uit één handeling (§7). De taal van de editor houdt de ingevulde
 * copy; de andere talen krijgen hun eigen tekst uit de tekstblokken en vallen
 * per ontbrekende rol terug op de editor-copy.
 */
export async function createCreativeSet(
  _prev: EditorActionState,
  formData: FormData,
): Promise<EditorActionState> {
  const user = await requireWriteUser();
  const parsed = parsePayload(formData);
  if (!parsed.ok) return parsed.state;
  const spec = parsed.value;

  if (!(await assertAssetExists(spec.assetId))) {
    return { error: "Het gekozen beeld bestaat niet (meer) in de bibliotheek. Kies een ander beeld." };
  }

  // Tekstblokken + producttokens voor de per-taal-copy.
  const blocks = spec.copyAngle
    ? await db
        .select({
          angle: copyBlocks.angle,
          locale: copyBlocks.locale,
          role: copyBlocks.role,
          text: copyBlocks.text,
          productId: copyBlocks.productId,
          pattern: copyBlocks.pattern,
        })
        .from(copyBlocks)
        .where(
          and(
            eq(copyBlocks.angle, spec.copyAngle),
            or(isNull(copyBlocks.productId), spec.productId ? eq(copyBlocks.productId, spec.productId) : undefined),
          ),
        )
    : [];
  let product: ProductTokens | null = null;
  if (spec.productId) {
    const [p] = await db
      .select({
        name: products.name,
        nameI18n: products.nameI18n,
        priceFromEur: products.priceFromEur,
        specs: products.specs,
      })
      .from(products)
      .where(eq(products.id, spec.productId))
      .limit(1);
    product = p ?? null;
  }

  const copyFor = (locale: CreativeLocale) => {
    if (locale === spec.locale || !spec.copyAngle) return spec.copy;
    const prefill = resolveCopyPrefill(blocks, {
      locale,
      angle: spec.copyAngle,
      productId: spec.productId ?? null,
      product,
    });
    // Terugval per rol op de editor-copy: liever dezelfde tekst dan een leeg veld.
    return {
      eyebrow: prefill.eyebrow ?? spec.copy.eyebrow,
      headline: prefill.headline ?? spec.copy.headline,
      subline: prefill.subline ?? spec.copy.subline,
      cta: prefill.cta ?? spec.copy.cta,
      badge: spec.copy.badge, // badge (prijs) is taalonafhankelijk geformatteerd in de editor
    };
  };

  // Basis-spec eerst; de overige elf verwijzen ernaar via parentId.
  const [base] = await db
    .insert(creativeSpecs)
    .values({
      productId: spec.productId ?? null,
      assetId: spec.assetId,
      template: spec.template,
      palette: spec.palette,
      format: spec.format,
      locale: spec.locale,
      copy: spec.copy,
      copyAngle: spec.copyAngle ?? null,
      status: "draft",
      parentId: spec.parentId ?? null,
      createdBy: user.email ?? user.name ?? user.id,
    })
    .returning({ id: creativeSpecs.id });

  const rest = FORMAT_NAMES.flatMap((format) =>
    LOCALES.map((locale) => ({ format, locale })),
  ).filter(({ format, locale }) => !(format === spec.format && locale === spec.locale));

  if (rest.length > 0) {
    await db.insert(creativeSpecs).values(
      rest.map(({ format, locale }) => ({
        productId: spec.productId ?? null,
        assetId: spec.assetId,
        template: spec.template,
        palette: spec.palette,
        format,
        locale,
        copy: copyFor(locale),
        copyAngle: spec.copyAngle ?? null,
        status: "draft" as const,
        parentId: base.id,
        createdBy: user.email ?? user.name ?? user.id,
      })),
    );
  }

  revalidatePath("/marketing/creatives");
  redirect(`/marketing/creatives?set=${base.id}`);
}

/** Menselijke controlelijst (§6b): wat het systeem niet kan controleren. */
const CHECKLIST_ITEMS = ["prijs", "taal", "claim"] as const;

/**
 * Zet een concept op `approved`. Weigert als de layoutvalidatie faalt of als
 * de controlelijst niet volledig is afgevinkt — geen vinkje, geen approved.
 */
export async function approveCreative(formData: FormData): Promise<void> {
  await requireWriteUser();
  const id = z.uuid().parse(formData.get("id"));

  const missing = CHECKLIST_ITEMS.filter((item) => formData.get(`check-${item}`) !== "on");
  if (missing.length > 0) {
    redirect(`/marketing/creatives/${id}?fout=controlelijst`);
  }

  const [row] = await db.select().from(creativeSpecs).where(eq(creativeSpecs.id, id)).limit(1);
  if (!row) redirect("/marketing/creatives");
  if (row.status !== "draft") redirect(`/marketing/creatives/${id}?fout=status`);

  const parsed = creativeSpecSchema.safeParse({ ...row, copy: row.copy ?? { headline: "" } });
  if (!parsed.success || validateSpecCopy(parsed.data).length > 0) {
    redirect(`/marketing/creatives/${id}?fout=validatie`);
  }

  await db
    .update(creativeSpecs)
    .set({ status: "approved" })
    .where(and(eq(creativeSpecs.id, id), eq(creativeSpecs.status, "draft")));

  revalidatePath("/marketing/creatives");
  revalidatePath(`/marketing/creatives/${id}`);
  redirect(`/marketing/creatives/${id}`);
}

/** Archiveer een spec (concept of goedgekeurd, niet live). */
export async function archiveCreative(formData: FormData): Promise<void> {
  await requireWriteUser();
  const id = z.uuid().parse(formData.get("id"));
  const [row] = await db
    .select({ status: creativeSpecs.status })
    .from(creativeSpecs)
    .where(eq(creativeSpecs.id, id))
    .limit(1);
  if (row && row.status !== "live") {
    await db.update(creativeSpecs).set({ status: "archived" }).where(eq(creativeSpecs.id, id));
  }
  revalidatePath("/marketing/creatives");
  redirect("/marketing/creatives");
}
