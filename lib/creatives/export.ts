/**
 * Renders persisteren voor export/publicatie (brief §4, tabel `renders`):
 * de PNG van een spec wordt éénmaal gerenderd en in onze Storage gezet; bij
 * een ongewijzigde spec-hash wordt de bestaande render hergebruikt in plaats
 * van opnieuw te renderen. De publicatieketen (lib/meta/publish) leest de
 * nieuwste render van een spec.
 *
 * Zelfde motor als de preview (§2: geen tweede rendermotor) — dit bestand
 * voegt alleen opslag + hergebruik toe rond `renderCreative`.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, creativeSpecs, renders } from "@/lib/db/schema";
import { marketingStorage } from "@/lib/marketing/storage";

import { renderCreative } from "./render";
import { renderableSpecSchema, specHash } from "./schema";

export type EnsureRenderResult =
  | { ok: true; renderId: string; storagePath: string; reused: boolean }
  | { ok: false; error: string };

/**
 * Zorg dat er een opgeslagen PNG-render voor deze spec bestaat en geef die
 * terug. Hergebruikt de bestaande render zolang de spec-hash gelijk blijft.
 * Fouten komen terug als NL-zinnen die direct in de UI passen.
 */
export async function ensureRenderForSpec(specId: string): Promise<EnsureRenderResult> {
  const [row] = await db
    .select({ spec: creativeSpecs, assetPath: assets.storagePath })
    .from(creativeSpecs)
    .leftJoin(assets, eq(assets.id, creativeSpecs.assetId))
    .where(eq(creativeSpecs.id, specId))
    .limit(1);
  if (!row) return { ok: false, error: "Creative niet gevonden." };
  if (!row.assetPath) {
    return {
      ok: false,
      error: "Het beeld van deze creative bestaat niet meer in de bibliotheek. Kies een ander beeld.",
    };
  }

  const storage = marketingStorage();
  const renderable = renderableSpecSchema.safeParse({
    template: row.spec.template,
    palette: row.spec.palette,
    format: row.spec.format,
    locale: row.spec.locale,
    copy: row.spec.copy ?? { headline: "" },
    copyAngle: row.spec.copyAngle,
    productId: row.spec.productId,
    assetId: row.spec.assetId,
    assetUrl: storage.publicUrl(row.assetPath),
  });
  if (!renderable.success) {
    return {
      ok: false,
      error: "Deze creative is onvolledig (bv. lege kop) en kan niet worden gerenderd.",
    };
  }

  const hash = specHash(renderable.data);
  const [existing] = await db
    .select({ id: renders.id, storagePath: renders.storagePath })
    .from(renders)
    .where(and(eq(renders.specId, specId), eq(renders.specHash, hash)))
    .limit(1);
  if (existing) {
    return { ok: true, renderId: existing.id, storagePath: existing.storagePath, reused: true };
  }

  try {
    const image = await renderCreative(renderable.data);
    const png = new Uint8Array(await image.arrayBuffer());
    const storagePath = await storage.put(
      `renders/${specId}/${hash.slice(0, 40)}.png`,
      png,
      "image/png",
    );
    const [inserted] = await db
      .insert(renders)
      .values({ specId, storagePath, specHash: hash })
      .onConflictDoNothing({ target: [renders.specId, renders.specHash] })
      .returning({ id: renders.id });
    // Race met een parallelle render? Dan bestaat de rij al — die is even goed.
    if (!inserted) {
      const [raced] = await db
        .select({ id: renders.id, storagePath: renders.storagePath })
        .from(renders)
        .where(and(eq(renders.specId, specId), eq(renders.specHash, hash)))
        .limit(1);
      return { ok: true, renderId: raced.id, storagePath: raced.storagePath, reused: true };
    }
    return { ok: true, renderId: inserted.id, storagePath, reused: false };
  } catch (err) {
    console.error("Render-export mislukt:", err);
    return {
      ok: false,
      error: "Het renderen van de PNG is mislukt. Probeer het opnieuw of controleer het beeld.",
    };
  }
}
