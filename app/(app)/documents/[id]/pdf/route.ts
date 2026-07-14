import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { companies, documents } from "@/lib/db/schema";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { enrichDocItemsForPdf } from "@/lib/document-pdf-data";
import { billingAddressLines } from "@/lib/documents";

async function fetchImage(url: string): Promise<{ data: Buffer; format: "jpg" | "png" } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const format = url.toLowerCase().includes(".png") ? "png" : "jpg";
    return { data: buf, format };
  } catch {
    return null;
  }
}

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

  // Bedrijf: van de factuur zelf, anders dat van het contact (zakelijke klant).
  const companyId = doc.companyId ?? doc.contact?.companyId ?? null;
  const company = companyId
    ? await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { name: true, vatNumber: true, addressLine: true, postalCode: true, city: true },
      })
    : null;
  // Zakelijk: bedrijfsadres voorrang; anders contactadres. Twee regels (straat /
  // postcode + plaats), net als ons eigen adres.
  const { line: addrLine, region: addrRegion } = billingAddressLines(company, doc.contact);

  // Verrijk de regels met SKU + maatvoering; haal voor de pakbon ook de productfoto's op.
  const { items, productImages } = await enrichDocItemsForPdf(doc.items);

  let lineImages: Record<string, { data: Buffer; format: "jpg" | "png" }> | undefined;
  if (doc.kind === "deliverynote") {
    lineImages = {};
    const withImg = Object.entries(productImages);
    const fetched = await Promise.all(withImg.map(([, url]) => fetchImage(url)));
    withImg.forEach(([pid], i) => {
      const f = fetched[i];
      if (f) lineImages![pid] = f;
    });
  }

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
    lineImages,
  });

  const label = doc.kind === "invoice" ? "Factuur" : "Offerte";
  const filename = `${label}-${doc.docNumber ?? doc.id.slice(0, 8)}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
