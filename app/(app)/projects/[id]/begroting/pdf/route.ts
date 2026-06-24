import { auth } from "@/auth";
import { renderBudgetPdf } from "@/lib/budget-pdf";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const pdf = await renderBudgetPdf(id);
  if (!pdf) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdf.filename}"`,
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
