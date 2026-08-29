/**
 * Klant-veilige PDF-download: alleen documenten (offerte/termijn/factuur/
 * creditnota, niet-concept) van projecten die bij de ingelogde klant horen.
 * Zelfde PDF-opbouw als de interne route app/(app)/documents/[id]/pdf.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { companies, documents } from "@/lib/db/schema";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { enrichDocItemsForPdf } from "@/lib/document-pdf-data";
import { billingAddressLines } from "@/lib/documents";
import { klantEmail, klantMagDocument } from "@/lib/klant-portal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const email = await klantEmail();
  if (!email) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await klantMagDocument(email, id))) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: {
      contact: {
        columns: {
          name: true,
          companyId: true,
          addressLine: true,
          postalCode: true,
          city: true,
          preferredLanguage: true,
          taxId: true,
        },
      },
      project: { columns: { name: true } },
    },
  });
  if (!doc) return NextResponse.json({ error: "not-found" }, { status: 404 });

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
    contactVat: company?.vatNumber ?? doc.contact?.taxId ?? null,
    projectName: doc.project?.name ?? null,
    locale: doc.contact?.preferredLanguage ?? "es",
  });

  const naam = `${doc.docNumber ?? doc.kind}.pdf`.replace(/[^\w.-]+/g, "-");
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${naam}"`,
      "cache-control": "no-store",
    },
  });
}
