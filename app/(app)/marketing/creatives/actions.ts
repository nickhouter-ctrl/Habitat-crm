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
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireWriteUser } from "@/lib/auth/guards";
import { creativeSpecSchema } from "@/lib/creatives/schema";
import { validateSpecCopy } from "@/lib/creatives/validate";
import { FORMAT_NAMES } from "@/lib/creatives/tokens";
import { db } from "@/lib/db";
import { assets, copyBlocks, creativeSpecs, products } from "@/lib/db/schema";
import { generateCreativeCopy } from "@/lib/marketing/ai-copy";
import { generateCarouselStory } from "@/lib/marketing/ai-story";
import { marketingStorage } from "@/lib/marketing/storage";
import {
  formatPriceFrom,
  getCopySuggestion,
  type CopyBlockLike,
} from "@/lib/marketing/copy-suggest";
import { TEMPLATES } from "@/lib/creatives/templates";

const LOCALES = ["nl", "en", "es", "de"] as const;

/** Payload uit de editor: een CreativeSpec mét verplichte asset + herkomst.
 *  `category` wordt niet opgeslagen — hij stuurt alleen de prefill van de
 *  overige talen bij "Maak set" (categorie volstaat, product is optioneel). */
const payloadSchema = creativeSpecSchema.extend({
  assetId: z.uuid("Kies eerst een beeld uit de bibliotheek."),
  /** Multi-select (U6): "Maak set" genereert per beeld × formaat × taal.
   *  Het eerste beeld is gelijk aan `assetId` (stuurt preview + los concept). */
  assetIds: z.array(z.uuid()).max(24, "Maximaal 24 beelden per set.").optional(),
  parentId: z.uuid().nullish(),
  category: z.string().max(200).nullish(),
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

/** Producttokens voor prefill en AI-copy (naam, categorie, vanafprijs, specs). */
async function loadProductTokens(productId: string | null) {
  if (!productId) return null;
  const [p] = await db
    .select({
      name: products.name,
      category: products.category,
      priceFromEur: products.priceFromEur,
      specs: products.specs,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return p ?? null;
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
  const product = await loadProductTokens(spec.productId ?? null);

  const copyFor = (locale: "nl" | "en" | "es" | "de") => {
    if (locale === spec.locale || !spec.copyAngle) return spec.copy;
    const prefill = getCopySuggestion(blocks as CopyBlockLike[], {
      angle: spec.copyAngle,
      locale,
      productId: spec.productId ?? null,
      priceFrom: product?.priceFromEur ?? null,
      finish: (product?.specs?.finish as string | undefined) ?? null,
      category: spec.category ?? product?.category ?? null,
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

  // Multi-select (U6): per gekozen beeld × formaat × taal één concept.
  const assetIds = [...new Set(spec.assetIds?.length ? spec.assetIds : [spec.assetId])];
  const existing = await db
    .select({ id: assets.id })
    .from(assets)
    .where(inArray(assets.id, assetIds));
  if (existing.length !== assetIds.length) {
    return { error: "Een van de gekozen beelden bestaat niet (meer). Open de beeldkiezer opnieuw." };
  }

  // Basis-spec eerst (eerste beeld, huidige formaat + taal); de rest van de
  // set verwijst ernaar via parentId.
  const [base] = await db
    .insert(creativeSpecs)
    .values({
      productId: spec.productId ?? null,
      assetId: assetIds[0],
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

  const rest = assetIds.flatMap((assetId) =>
    FORMAT_NAMES.flatMap((format) =>
      LOCALES.map((locale) => ({ assetId, format, locale })),
    ),
  ).filter(
    ({ assetId, format, locale }) =>
      !(assetId === assetIds[0] && format === spec.format && locale === spec.locale),
  );

  if (rest.length > 0) {
    await db.insert(creativeSpecs).values(
      rest.map(({ assetId, format, locale }) => ({
        productId: spec.productId ?? null,
        assetId,
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

/**
 * Keur een hele set (basis-spec + varianten) in één keer goed. Zelfde
 * poortwachter als per stuk: de controlelijst is verplicht (één keer voor de
 * set — de vinkjes gaan over de gedeelde prijs/claim en over álle talen) en
 * élke variant moet door de layoutvalidatie. Faalt er één, dan keurt er niets
 * goed en wijst de melding aan welke.
 */
export async function approveCreativeSet(formData: FormData): Promise<void> {
  await requireWriteUser();
  const setId = z.uuid().parse(formData.get("setId"));

  const missing = CHECKLIST_ITEMS.filter((item) => formData.get(`check-${item}`) !== "on");
  if (missing.length > 0) {
    redirect(`/marketing/creatives?set=${setId}&fout=controlelijst`);
  }

  const specs = await db
    .select()
    .from(creativeSpecs)
    .where(
      and(
        or(eq(creativeSpecs.id, setId), eq(creativeSpecs.parentId, setId)),
        eq(creativeSpecs.status, "draft"),
      ),
    );
  if (specs.length === 0) redirect(`/marketing/creatives?set=${setId}&fout=leeg`);

  const invalid = specs.filter((row) => {
    const parsed = creativeSpecSchema.safeParse({ ...row, copy: row.copy ?? { headline: "" } });
    return !parsed.success || validateSpecCopy(parsed.data).length > 0;
  });
  if (invalid.length > 0) {
    redirect(`/marketing/creatives?set=${setId}&fout=validatie&aantal=${invalid.length}`);
  }

  await db
    .update(creativeSpecs)
    .set({ status: "approved" })
    .where(
      and(
        inArray(creativeSpecs.id, specs.map((s) => s.id)),
        eq(creativeSpecs.status, "draft"),
      ),
    );

  revalidatePath("/marketing/creatives");
  redirect(`/marketing/creatives?status=approved`);
}

/* ---------------------------------------------------------------- AI-copy */

const aiRequestSchema = z.object({
  locale: z.enum(["nl", "en", "es", "de"]),
  angle: z.enum(["material", "price", "showroom", "project", "seasonal"]).nullish(),
  productId: z.uuid().nullish(),
  category: z.string().max(200).nullish(),
  template: z.enum(["frame", "split", "swatch", "price"]),
  format: z.enum(["1080x1080", "1080x1350", "1080x1920"]),
  /** Gekozen beeld — de AI kijkt er dan naar en schrijft bij wat er te zien is. */
  assetId: z.uuid().nullish(),
});

/** Publieke URL van een asset, of null als het beeld of de opslag ontbreekt. */
async function assetPublicUrl(assetId: string | null | undefined): Promise<string | null> {
  if (!assetId) return null;
  const [row] = await db
    .select({ storagePath: assets.storagePath })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);
  if (!row) return null;
  try {
    return marketingStorage().publicUrl(row.storagePath);
  } catch {
    return null;
  }
}

/**
 * "Genereer met AI" (taak U3): schrijf alle copyvelden in de doeltaal, binnen
 * de tekenlimieten van het gekozen sjabloon × formaat. Zonder
 * ANTHROPIC_API_KEY of bij een fout krijgt de gebruiker een duidelijke
 * melding en blijft "Vul automatisch" (copyblokken) het pad.
 */
export async function generateAiCopyAction(input: unknown): Promise<{
  copy?: { eyebrow?: string; headline?: string; subline?: string; cta?: string; badge?: string };
  error?: string;
}> {
  await requireWriteUser();
  const parsed = aiRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "Ongeldige aanvraag voor AI-copy." };
  const req = parsed.data;

  const product = await loadProductTokens(req.productId ?? null);
  const limits = TEMPLATES[req.template].limits[req.format];
  const copy = await generateCreativeCopy({
    locale: req.locale,
    angle: req.angle ?? null,
    productName: product?.name ?? null,
    category: req.category ?? product?.category ?? null,
    priceFormatted: product?.priceFromEur
      ? formatPriceFrom(product.priceFromEur, req.locale)
      : null,
    limits,
    imageUrl: await assetPublicUrl(req.assetId),
  });
  if (!copy) {
    return {
      error:
        "AI-copy is niet beschikbaar (geen ANTHROPIC_API_KEY of de aanvraag mislukte). Gebruik 'Vul automatisch' voor de vastgelegde tekstblokken.",
    };
  }
  return { copy };
}

/* ----------------------------------------------------------- AI-carrousel */

const carouselAiSchema = z.object({
  /** Beelden in de door de gebruiker gekozen volgorde (2–10, zoals Meta eist). */
  assetIds: z.array(z.uuid()).min(2).max(10),
  locale: z.enum(["nl", "en", "es", "de"]),
  angle: z.enum(["material", "price", "showroom", "project", "seasonal"]).nullish(),
  subject: z.string().max(300).nullish(),
  category: z.string().max(200).nullish(),
  template: z.enum(["frame", "split", "swatch", "price"]),
  format: z.enum(["1080x1080", "1080x1350", "1080x1920"]),
});

/**
 * Laat de AI het carrouselverhaal schrijven: kijkt naar de gekozen beelden,
 * stelt een kaartvolgorde voor en schrijft per kaartje kop + subregel die
 * samen één verhaal vertellen, plus de advertentietekst erboven.
 */
export async function generateCarouselStoryAction(input: unknown): Promise<{
  story?: {
    /** Asset-ids in de AI-voorgestelde verhaalvolgorde. */
    orderedAssetIds: string[];
    cards: { headline: string; subline?: string }[];
    message: string;
    name: string;
  };
  error?: string;
}> {
  await requireWriteUser();
  const parsed = carouselAiSchema.safeParse(input);
  if (!parsed.success) return { error: "Ongeldige aanvraag voor het carrouselverhaal." };
  const req = parsed.data;

  const rows = await db
    .select({
      id: assets.id,
      storagePath: assets.storagePath,
      sourceRef: assets.sourceRef,
      productName: products.name,
    })
    .from(assets)
    .leftJoin(products, eq(products.id, assets.productId))
    .where(inArray(assets.id, req.assetIds));
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (byId.size !== req.assetIds.length) {
    return { error: "Een van de gekozen beelden bestaat niet (meer). Open de beeldkiezer opnieuw." };
  }

  const images = req.assetIds.map((id) => {
    const row = byId.get(id)!;
    let url: string | null = null;
    try {
      url = marketingStorage().publicUrl(row.storagePath);
    } catch {
      url = null;
    }
    return { id, url, label: row.productName ?? row.sourceRef ?? "beeld" };
  });
  const missing = images.filter((i) => !i.url);
  if (missing.length > 0) {
    return { error: "Van een van de beelden ontbreekt de opslagkopie — kies een ander beeld." };
  }

  const story = await generateCarouselStory({
    images: images.map((i) => ({ url: i.url!, label: i.label })),
    locale: req.locale,
    angle: req.angle ?? null,
    subject: req.subject ?? null,
    category: req.category ?? null,
    limits: TEMPLATES[req.template].limits[req.format],
  });
  if (!story) {
    return {
      error:
        "Het AI-verhaal is niet beschikbaar (geen ANTHROPIC_API_KEY of de aanvraag mislukte). Vul de kaartteksten met de hand in of probeer opnieuw.",
    };
  }

  return {
    story: {
      orderedAssetIds: story.order.map((i) => req.assetIds[i]),
      cards: story.cards,
      message: story.message,
      name: story.name,
    },
  };
}

const createCarouselSchema = carouselAiSchema.extend({
  palette: z.enum(["diep", "creme", "terracotta", "salie"]),
  /** Kaartjes in definitieve volgorde; assetIds hierboven zijn dan al herordend. */
  cards: z
    .array(
      z.object({
        assetId: z.uuid(),
        headline: z.string().min(1, "Elke kaart heeft een kop nodig").max(400),
        subline: z.string().max(600).optional(),
      }),
    )
    .min(2)
    .max(10),
  message: z.string().max(2000).nullish(),
  productId: z.uuid().nullish(),
});

/**
 * Maak een carrouselset aan als concepten: de eerste kaart is de basis-spec,
 * de rest verwijst ernaar via parentId; `carouselOrder` legt de kaartvolgorde
 * vast en `suggestedMessage` bewaart de AI-advertentietekst voor de
 * publicatiestap. Faalt één kaart op de layoutvalidatie, dan wordt er niets
 * aangemaakt en wijst de melding aan welke.
 */
export async function createCarouselSetAction(input: unknown): Promise<{
  setId?: string;
  error?: string;
}> {
  const user = await requireWriteUser();
  const parsed = createCarouselSchema.safeParse(input);
  if (!parsed.success) return { error: "De carrousel is niet compleet — controleer de kaartteksten." };
  const req = parsed.data;

  const existing = await db
    .select({ id: assets.id })
    .from(assets)
    .where(inArray(assets.id, req.cards.map((c) => c.assetId)));
  if (existing.length !== new Set(req.cards.map((c) => c.assetId)).size) {
    return { error: "Een van de gekozen beelden bestaat niet (meer). Open de beeldkiezer opnieuw." };
  }

  // Poortwachter vooraf: elke kaart moet door dezelfde layoutvalidatie als de
  // approve-stap — anders maak je concepten aan die nooit goedgekeurd kunnen worden.
  const invalid: number[] = [];
  req.cards.forEach((card, i) => {
    const spec = creativeSpecSchema.safeParse({
      template: req.template,
      palette: req.palette,
      format: req.format,
      locale: req.locale,
      copy: { headline: card.headline, subline: card.subline },
      copyAngle: req.angle ?? null,
    });
    if (!spec.success || validateSpecCopy(spec.data).length > 0) invalid.push(i + 1);
  });
  if (invalid.length > 0) {
    return {
      error: `Kaart ${invalid.join(", ")} past niet in het sjabloon (tekst te lang). Kort de kop of subregel in.`,
    };
  }

  const common = {
    productId: req.productId ?? null,
    template: req.template,
    palette: req.palette,
    format: req.format,
    locale: req.locale,
    copyAngle: req.angle ?? null,
    status: "draft" as const,
    createdBy: user.email ?? user.name ?? user.id,
  };

  const [base] = await db
    .insert(creativeSpecs)
    .values({
      ...common,
      assetId: req.cards[0].assetId,
      copy: { headline: req.cards[0].headline, subline: req.cards[0].subline },
      carouselOrder: 1,
      suggestedMessage: req.message ?? null,
    })
    .returning({ id: creativeSpecs.id });

  if (req.cards.length > 1) {
    await db.insert(creativeSpecs).values(
      req.cards.slice(1).map((card, i) => ({
        ...common,
        assetId: card.assetId,
        copy: { headline: card.headline, subline: card.subline },
        parentId: base.id,
        carouselOrder: i + 2,
      })),
    );
  }

  revalidatePath("/marketing/creatives");
  return { setId: base.id };
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
