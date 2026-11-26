import { z } from "zod";
import { weigerRoute } from "@/lib/auth/guards";
import { renderProjectCostBreakdownPdf } from "@/lib/project-cost-breakdown-pdf";

export const dynamic = "force-dynamic";

/** Intern kostenoverzicht per arbeider, leverancier en productgroep. Alleen intern. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await weigerRoute("projects");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  try {
    const pdf = await renderProjectCostBreakdownPdf(id);
    if (!pdf) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(pdf.buffer), { headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdf.filename}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    } });
  } catch {
    console.error("cost_breakdown_pdf_failed", { projectId: id });
    return new Response("Unable to generate overview", { status: 500 });
  }
}
