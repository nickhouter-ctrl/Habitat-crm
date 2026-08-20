import { renderDocumentPdfById } from "@/lib/document-render";

export const dynamic = "force-dynamic";

// Public (token-based) — no auth; /offerte is excluded in auth.config.ts.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // Bewust zonder handtekening: dit blijft de offerte-PDF. De getekende
  // overeenkomst heeft een eigen route (/offerte/[token]/contract/pdf).
  const out = await renderDocumentPdfById(token, { by: "token", signature: null });
  if (!out) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(out.buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${out.filename}"`,
    },
  });
}
