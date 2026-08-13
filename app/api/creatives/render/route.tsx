/**
 * Render-endpoint voor creatives (brief §6) — het ENIGE render-pad: de editor
 * gebruikt het gedebounced als <img src>, en export/publicatie haalt de PNG
 * hier óók vandaan (§2: geen tweede rendermotor).
 *
 * Twee aanroepvormen:
 *   GET /api/creatives/render?spec=<base64url-JSON>   — inline spec mét assetUrl
 *   GET /api/creatives/render?id=<spec-uuid>          — opgeslagen spec; het
 *       beeld wordt via de asset-tabel en onze eigen Storage opgelost
 *
 * Cache-gedrag: bij ?spec zit de volledige inhoud in de URL → lang cachebaar;
 * bij ?id kan een draft nog wijzigen → kort. De spec-hash reist mee als ETag.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { renderableSpecSchema, specHash } from "@/lib/creatives/schema";
import { renderCreative } from "@/lib/creatives/render";
import { db } from "@/lib/db";
import { assets, creativeSpecs } from "@/lib/db/schema";
import { marketingStorage } from "@/lib/marketing/storage";

export const dynamic = "force-dynamic";

function badRequest(message: string, detail?: unknown): NextResponse {
  return NextResponse.json({ error: message, detail }, { status: 400 });
}

/** Zoek een opgeslagen spec op en los het beeld op naar onze Storage-URL. */
async function loadSpecFromDb(id: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ spec: creativeSpecs, assetPath: assets.storagePath })
    .from(creativeSpecs)
    .leftJoin(assets, eq(assets.id, creativeSpecs.assetId))
    .where(eq(creativeSpecs.id, id))
    .limit(1);
  if (!row) return null;
  if (!row.assetPath) return { missingAsset: true };
  const s = row.spec;
  return {
    template: s.template,
    palette: s.palette,
    format: s.format,
    locale: s.locale,
    copy: s.copy ?? { headline: "" },
    copyAngle: s.copyAngle,
    productId: s.productId,
    assetId: s.assetId,
    assetUrl: marketingStorage().publicUrl(row.assetPath),
  };
}

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const specParam = url.searchParams.get("spec");
  const idParam = url.searchParams.get("id");
  if (!specParam && !idParam) {
    return badRequest("Geef ?spec= (base64-JSON) of ?id= (spec-uuid) mee.");
  }

  let rawSpec: unknown;
  let cacheControl: string;
  if (specParam) {
    try {
      rawSpec = JSON.parse(Buffer.from(specParam, "base64url").toString("utf8"));
    } catch {
      return badRequest("De spec-parameter is geen geldige base64-gecodeerde JSON.");
    }
    // De URL bepaalt de inhoud volledig → agressief cachen is veilig.
    cacheControl = "private, max-age=31536000, immutable";
  } else {
    if (!z.uuid().safeParse(idParam).success) {
      return badRequest("De id-parameter is geen geldige uuid.");
    }
    const loaded = await loadSpecFromDb(idParam!);
    if (!loaded) {
      return NextResponse.json({ error: "Spec niet gevonden." }, { status: 404 });
    }
    if (loaded.missingAsset) {
      return badRequest(
        "Het beeld van deze spec bestaat niet meer in de asset-bibliotheek. Kies een ander beeld.",
      );
    }
    rawSpec = loaded;
    // Drafts kunnen wijzigen; kort cachen dempt alleen dubbele previews.
    cacheControl = "private, max-age=60";
  }

  const parsed = renderableSpecSchema.safeParse(rawSpec);
  if (!parsed.success) {
    return badRequest(
      "De spec is ongeldig. Controleer sjabloon, formaat, palet, taal en tekstvelden.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  try {
    const image = await renderCreative(parsed.data);
    const headers = new Headers(image.headers);
    headers.set("Content-Type", "image/png");
    headers.set("Cache-Control", cacheControl);
    headers.set("ETag", `"${specHash(parsed.data)}"`);
    return new Response(image.body, { status: 200, headers });
  } catch (err) {
    // Renderfout is een serverprobleem, geen gebruikersfout — log de details,
    // geef de gebruiker een handelingsgerichte melding (§9).
    console.error("Creative render mislukt:", err);
    return NextResponse.json(
      {
        error:
          "Het renderen van de creative is mislukt. Probeer het opnieuw; blijft dit gebeuren, controleer dan of het gekozen beeld nog bestaat.",
      },
      { status: 500 },
    );
  }
}
