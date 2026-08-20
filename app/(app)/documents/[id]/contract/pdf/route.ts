import { renderDocumentPdfById } from "@/lib/document-render";

export const dynamic = "force-dynamic";

/**
 * De getekende overeenkomst, intern. Ligt binnen de `(app)`-groep, dus `proxy.ts`
 * beschermt hem al — een uitgelogde bezoeker komt op /login uit.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const out = await renderDocumentPdfById(id, { contract: true });
  if (!out) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(out.buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${out.filename}"`,
    },
  });
}
