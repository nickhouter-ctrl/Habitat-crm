import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { renderDocumentPdf } from "@/lib/document-pdf";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: {
      contact: { columns: { name: true, addressLine: true, postalCode: true, city: true } },
    },
  });
  if (!doc) return new Response("Not found", { status: 404 });

  const addr =
    [
      doc.contact?.addressLine,
      [doc.contact?.postalCode, doc.contact?.city].filter(Boolean).join(" "),
    ]
      .filter((p) => p && p.trim())
      .join(", ") || null;

  const buf = await renderDocumentPdf({
    kind: doc.kind,
    docNumber: doc.docNumber,
    title: doc.title,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    subtotalEur: doc.subtotalEur,
    taxEur: doc.taxEur,
    totalEur: doc.totalEur,
    items: doc.items ?? [],
    notes: doc.notes,
    contactName: doc.contact?.name ?? null,
    contactAddress: addr,
  });

  const label = doc.kind === "invoice" ? "Factuur" : "Offerte";
  const filename = `${label}-${doc.docNumber ?? doc.id.slice(0, 8)}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
}
