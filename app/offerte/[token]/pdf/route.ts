import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { companies, documents } from "@/lib/db/schema";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { enrichDocItemsForPdf } from "@/lib/document-pdf-data";
import { billingAddressLines } from "@/lib/documents";

export const dynamic = "force-dynamic";

// Public (token-based) — no auth; /offerte is excluded in auth.config.ts.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.acceptToken, token),
    with: {
      contact: {
        columns: {
          name: true,
          companyId: true,
          addressLine: true,
          postalCode: true,
          city: true,
          preferredLanguage: true,
        },
      },
      project: { columns: { name: true } },
    },
  });
  if (!doc) return new Response("Not found", { status: 404 });

  const companyId = doc.companyId ?? doc.contact?.companyId ?? null;
  const company = companyId
    ? await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { name: true, vatNumber: true, addressLine: true, postalCode: true, city: true },
      })
    : null;
  const { line: addrLine, region: addrRegion } = billingAddressLines(company, doc.contact);
  const { items } = await enrichDocItemsForPdf(doc.items);

  const buf = await renderDocumentPdf({
    kind: doc.kind,
    docNumber: doc.docNumber,
    title: doc.title,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    subtotalEur: doc.subtotalEur,
    taxEur: doc.taxEur,
    totalEur: doc.totalEur,
    items,
    notes: doc.notes,
    vatReverseCharge: doc.vatReverseCharge,
    contactName: doc.contact?.name ?? null,
    contactAddressLine: addrLine,
    contactAddressRegion: addrRegion,
    companyName: company?.name ?? null,
    contactVat: company?.vatNumber ?? null,
    projectName: doc.project?.name ?? null,
    locale: doc.contact?.preferredLanguage ?? "es",
  });

  const label =
    doc.kind === "invoice" ? "Factuur" : doc.kind === "fondos" ? "Provision-de-fondos" : doc.kind === "creditnote" ? "Creditnota" : "Offerte";
  const filename = `${label}-${doc.docNumber ?? token.slice(0, 8)}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
}
