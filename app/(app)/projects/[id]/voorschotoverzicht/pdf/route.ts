import { z } from "zod";
import { weigerRoute } from "@/lib/auth/guards";
import { renderClientFundingPdf } from "@/lib/client-funding-pdf";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await weigerRoute("projects");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const lang = new URL(req.url).searchParams.get("lang");
  if (lang !== null && !isLocale(lang)) return new Response("Invalid language", { status: 400 });
  try {
    const pdf = await renderClientFundingPdf(id, isLocale(lang) ? lang : undefined);
    if (!pdf) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(pdf.buffer), { headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdf.filename}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    } });
  } catch {
    console.error("client_funding_pdf_failed", { projectId: id });
    return new Response("Unable to generate overview", { status: 500 });
  }
}
