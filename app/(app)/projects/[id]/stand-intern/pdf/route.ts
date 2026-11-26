import { z } from "zod";
import { weigerRoute } from "@/lib/auth/guards";
import { renderInternalStatusPdf } from "@/lib/project-internal-status-pdf";

export const dynamic = "force-dynamic";

/** Interne stand (echte kosten vs. doorberekend). Alleen voor intern gebruik. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await weigerRoute("projects");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  try {
    const pdf = await renderInternalStatusPdf(id);
    if (!pdf) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(pdf.buffer), { headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdf.filename}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    } });
  } catch {
    console.error("internal_status_pdf_failed", { projectId: id });
    return new Response("Unable to generate overview", { status: 500 });
  }
}
