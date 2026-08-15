/**
 * Publiceer een goedgekeurde CreativeSpec als GEPAUZEERDE Meta-advertentie
 * (brief §7). Pakt de nieuwste render van de spec, draait de keten
 * PNG → adimages → adcreatives → ads, en synct direct de status terug zodat
 * die binnen een minuut in het CRM staat.
 */
import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ads, creativeSpecs, renders } from "@/lib/db/schema";
import { marketingStorage } from "@/lib/marketing/storage";
import { publishAdToMeta, publishCarouselAdToMeta } from "@/lib/meta/publish";
import { syncSingleAd } from "@/lib/meta/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const publishBody = z.object({
  /** Eén spec = gewone beeld-ad. */
  specId: z.uuid().optional(),
  /** 2–10 specs = carrousel (volgorde = kaartvolgorde). */
  specIds: z.array(z.uuid()).min(2).max(10).optional(),
  /** Onze ad_sets-rij (moet al een Meta-id hebben). */
  adSetId: z.uuid(),
  /** Naam van de advertentie in Meta én het CRM. */
  name: z.string().min(1).max(200),
  /** Advertentietekst (message in de link_data). */
  message: z.string().min(1).max(2000),
  /** Landingspagina. */
  link: z.url(),
  /** Meta CTA-type, bv. LEARN_MORE / CONTACT_US. */
  callToAction: z.string().optional(),
}).refine((b) => !!b.specId !== !!b.specIds, {
  message: "Geef óf specId (één beeld) óf specIds (carrousel) op.",
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  if ((session.user as { role?: string }).role === "viewer") {
    return NextResponse.json(
      { error: "Alleen-lezen account: publiceren is niet toegestaan voor de rol 'viewer'." },
      { status: 403 },
    );
  }

  const parsed = publishBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige aanvraag: controleer spec, advertentieset, tekst en link." },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Nieuwste render per spec ophalen — de PNG is een afgeleide van de spec (§3.2).
  const loadPng = async (specId: string): Promise<Uint8Array | { error: string }> => {
    const [render] = await db
      .select()
      .from(renders)
      .where(eq(renders.specId, specId))
      .orderBy(desc(renders.renderedAt))
      .limit(1);
    if (!render) {
      return { error: "Er is nog geen render voor deze creative. Render de creative eerst." };
    }
    const pngRes = await fetch(marketingStorage().publicUrl(render.storagePath), {
      cache: "no-store",
    });
    if (!pngRes.ok) {
      return { error: "De render-PNG kon niet uit de opslag worden gehaald. Render de creative opnieuw." };
    }
    return new Uint8Array(await pngRes.arrayBuffer());
  };

  // ------------------------------------------------------------- carrousel
  if (input.specIds) {
    const pngs: Uint8Array[] = [];
    for (const specId of input.specIds) {
      const png = await loadPng(specId);
      if (!(png instanceof Uint8Array)) {
        return NextResponse.json({ error: png.error }, { status: 422 });
      }
      pngs.push(png);
    }
    const specRows = await db
      .select({ id: creativeSpecs.id, copy: creativeSpecs.copy })
      .from(creativeSpecs)
      .where(inArray(creativeSpecs.id, input.specIds));
    const copyById = new Map(specRows.map((s) => [s.id, s.copy]));
    const cards = input.specIds.map((id) => ({
      headline: copyById.get(id)?.headline ?? null,
      subline: copyById.get(id)?.subline ?? null,
    }));

    // Hergebruik een niet-gepubliceerde carrousel-rij voor dezelfde kaartjes.
    const [existing] = await db
      .select()
      .from(ads)
      .where(and(eq(ads.adSetId, input.adSetId), isNull(ads.metaId), eq(ads.specId, input.specIds[0])))
      .limit(1);
    const adId =
      existing && JSON.stringify(existing.carouselSpecIds) === JSON.stringify(input.specIds)
        ? existing.id
        : (
            await db
              .insert(ads)
              .values({
                adSetId: input.adSetId,
                specId: input.specIds[0],
                carouselSpecIds: input.specIds,
                name: input.name,
              })
              .returning({ id: ads.id })
          )[0].id;

    const result = await publishCarouselAdToMeta({
      adId,
      pngs,
      cards,
      message: input.message,
      link: input.link,
      callToAction: input.callToAction,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, adId }, { status: 502 });
    }
    const status = await syncSingleAd(adId).catch(() => null);
    return NextResponse.json({
      ok: true,
      adId,
      metaAdId: result.metaAdId,
      effectiveStatus: status?.effective_status ?? "PAUSED",
    });
  }

  // ------------------------------------------------------- enkele beeld-ad
  const specId = input.specId!;
  const png = await loadPng(specId);
  if (!(png instanceof Uint8Array)) {
    return NextResponse.json({ error: png.error }, { status: png.error.includes("opslag") ? 502 : 422 });
  }

  // Hergebruik een nog niet gepubliceerde ad-rij voor deze spec × set — een
  // herhaalde klik na een fout maakt zo geen duplicaten aan.
  const [existing] = await db
    .select()
    .from(ads)
    .where(and(eq(ads.specId, specId), eq(ads.adSetId, input.adSetId), isNull(ads.metaId)))
    .limit(1);
  const adId =
    existing?.id ??
    (
      await db
        .insert(ads)
        .values({ adSetId: input.adSetId, specId, name: input.name })
        .returning({ id: ads.id })
    )[0].id;

  const result = await publishAdToMeta({
    adId,
    png,
    message: input.message,
    link: input.link,
    callToAction: input.callToAction,
  });
  if (!result.ok) {
    // De fout staat ook al zichtbaar op de ad-rij (reviewFeedback.publishError).
    return NextResponse.json({ error: result.error, adId }, { status: 502 });
  }

  // Acceptatie §7: status binnen een minuut terug — direct één gerichte sync.
  const status = await syncSingleAd(adId).catch(() => null);
  return NextResponse.json({
    ok: true,
    adId,
    metaAdId: result.metaAdId,
    effectiveStatus: status?.effective_status ?? "PAUSED",
  });
}
