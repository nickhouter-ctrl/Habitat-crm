/**
 * Publiceer een goedgekeurde CreativeSpec als GEPAUZEERDE Meta-advertentie
 * (brief §7). Pakt de nieuwste render van de spec, draait de keten
 * PNG → adimages → adcreatives → ads, en synct direct de status terug zodat
 * die binnen een minuut in het CRM staat.
 */
import { desc, eq, isNull, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ads, renders } from "@/lib/db/schema";
import { marketingStorage } from "@/lib/marketing/storage";
import { publishAdToMeta } from "@/lib/meta/publish";
import { syncSingleAd } from "@/lib/meta/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const publishBody = z.object({
  specId: z.uuid(),
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

  // Nieuwste render van de spec — de PNG is een afgeleide van de spec (§3.2).
  const [render] = await db
    .select()
    .from(renders)
    .where(eq(renders.specId, input.specId))
    .orderBy(desc(renders.renderedAt))
    .limit(1);
  if (!render) {
    return NextResponse.json(
      { error: "Er is nog geen render voor deze creative. Render de creative eerst." },
      { status: 422 },
    );
  }

  const pngRes = await fetch(marketingStorage().publicUrl(render.storagePath), {
    cache: "no-store",
  });
  if (!pngRes.ok) {
    return NextResponse.json(
      { error: "De render-PNG kon niet uit de opslag worden gehaald. Render de creative opnieuw." },
      { status: 502 },
    );
  }
  const png = new Uint8Array(await pngRes.arrayBuffer());

  // Hergebruik een nog niet gepubliceerde ad-rij voor deze spec × set — een
  // herhaalde klik na een fout maakt zo geen duplicaten aan.
  const [existing] = await db
    .select()
    .from(ads)
    .where(and(eq(ads.specId, input.specId), eq(ads.adSetId, input.adSetId), isNull(ads.metaId)))
    .limit(1);
  const adId =
    existing?.id ??
    (
      await db
        .insert(ads)
        .values({ adSetId: input.adSetId, specId: input.specId, name: input.name })
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
