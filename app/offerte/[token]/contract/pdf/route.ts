import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { renderDocumentPdfById } from "@/lib/document-render";

export const dynamic = "force-dynamic";

/**
 * De overeenkomst als PDF — publiek met het offerte-token.
 *
 * Vóór ondertekening het concept (dezelfde artikelen als op het scherm), erna
 * het getekende exemplaar met bewijsblok. Altijd opnieuw gerenderd uit de
 * database: het opgeslagen bestand is een kopie voor het archief, niet de bron.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.acceptToken, token),
    columns: { id: true, kind: true },
  });
  if (!doc || doc.kind !== "estimate") return new Response("Not found", { status: 404 });

  const out = await renderDocumentPdfById(doc.id, { contract: true });
  if (!out) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(out.buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${out.filename}"`,
    },
  });
}
