import { renderVoortgangPdf } from "@/lib/voortgang-pdf";
import { weigerRoute } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const nee = await weigerRoute("projects");
  if (nee) return nee;

  const { id } = await ctx.params;
  const pdf = await renderVoortgangPdf(id);
  if (!pdf) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdf.filename}"`,
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
