/**
 * Handmatige upload naar de asset-bibliotheek (brief §5). Gaat door exact
 * dezelfde verwerkingspijplijn als de website- en Instagram-sync (afmetingen,
 * perceptuele hash + duplicaatdetectie, dominante kleuren) — een upload
 * gedraagt zich identiek aan een gesynchroniseerd beeld.
 *
 * POST multipart/form-data:
 *   file      — één of meer beeldbestanden (jpeg/png/webp/avif, ≤ 25 MB)
 *   productId — optioneel: koppel de beelden aan een product (uuid)
 *   tags      — optioneel: komma-gescheiden tags
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";

import { emptySummary, ingestFromBytes, tally } from "../_ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fieldsSchema = z.object({
  productId: z.uuid().nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  if ((session.user as { role?: string }).role === "viewer") {
    return NextResponse.json(
      { error: "Alleen-lezen account: uploaden is niet toegestaan voor de rol 'viewer'." },
      { status: 403 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "Verwacht multipart/form-data met een 'file'-veld." },
      { status: 400 },
    );
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Geen bestand meegestuurd." }, { status: 400 });
  }

  const parsed = fieldsSchema.safeParse({
    productId: (form.get("productId") as string | null) || null,
    tags: ((form.get("tags") as string | null) ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldig productId (uuid verwacht) of ongeldige tags." },
      { status: 400 },
    );
  }

  const summary = emptySummary();
  const results: Array<{ file: string; status: string; assetId?: string }> = [];
  // Sequentieel: de duplicaatdetectie moet elk vorig beeld al kennen.
  for (const file of files) {
    try {
      const result = await ingestFromBytes({
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type,
        source: "upload",
        sourceRef: file.name,
        productId: parsed.data.productId,
        tags: parsed.data.tags,
      });
      tally(summary, result);
      results.push({ file: file.name, status: result.status, assetId: result.assetId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${file.name}: ${message}`);
      results.push({ file: file.name, status: "error" });
    }
  }

  return NextResponse.json(
    { ok: summary.errors.length === 0, ...summary, results },
    { status: summary.errors.length === 0 ? 200 : 207 },
  );
}
