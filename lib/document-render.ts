/**
 * Eén plek die een document-PDF opbouwt uit de database.
 *
 * Dezelfde ~30 regels stonden in de publieke token-route en zouden nu ook nodig
 * zijn voor de contract-PDF (publiek én intern) en voor het exemplaar dat bij
 * ondertekening wordt opgeslagen en gemaild. Vier kopieën van de adres- en
 * btw-logica gaan gegarandeerd uit elkaar lopen.
 */
import "server-only";
import { eq } from "drizzle-orm";

import { contractArticles, contractLang } from "@/lib/contract-terms";
import { db } from "@/lib/db";
import { companies, documents, type DocumentSignature } from "@/lib/db/schema";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { enrichDocItemsForPdf } from "@/lib/document-pdf-data";
import { billingAddressLines } from "@/lib/documents";

type Rendered = { buf: Buffer; filename: string };

function kindLabel(kind: string): string {
  return kind === "invoice"
    ? "Factuur"
    : kind === "fondos"
      ? "Provision-de-fondos"
      : kind === "creditnote"
        ? "Creditnota"
        : "Offerte";
}

/**
 * Rendert het document. Met `signature` (of een reeds getekend document) komt de
 * overeenkomstpagina met bewijsblok erbij; de regels en bedragen komen dan uit
 * de bevroren snapshot, niet uit de huidige rij — dat is het hele punt van de
 * snapshot.
 */
export async function renderDocumentPdfById(
  id: string,
  opts: {
    by?: "id" | "token";
    signature?: DocumentSignature | null;
    /** Nog niet getekend: toch de artikelenpagina meenemen (concept-contract). */
    contract?: boolean;
  } = {},
): Promise<Rendered | null> {
  const doc = await db.query.documents.findFirst({
    where: opts.by === "token" ? eq(documents.acceptToken, id) : eq(documents.id, id),
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
  if (!doc) return null;

  const signature = opts.signature ?? doc.signature ?? null;
  const snap = signature?.snapshot ?? null;

  const companyId = doc.companyId ?? doc.contact?.companyId ?? null;
  const company = companyId
    ? await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { name: true, vatNumber: true, addressLine: true, postalCode: true, city: true },
      })
    : null;
  const { line: addrLine, region: addrRegion } = billingAddressLines(company, doc.contact);
  const { items } = await enrichDocItemsForPdf(snap ? snap.items : doc.items);

  const buf = await renderDocumentPdf({
    kind: doc.kind,
    docNumber: snap?.docNumber ?? doc.docNumber,
    title: snap?.title ?? doc.title,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    subtotalEur: snap?.subtotalEur ?? doc.subtotalEur,
    taxEur: snap?.taxEur ?? doc.taxEur,
    totalEur: snap?.totalEur ?? doc.totalEur,
    items,
    notes: snap?.notes ?? doc.notes,
    vatReverseCharge: doc.vatReverseCharge,
    contactName: doc.contact?.name ?? null,
    contactAddressLine: addrLine,
    contactAddressRegion: addrRegion,
    companyName: company?.name ?? null,
    // Bedrijfsklant heeft het btw-nummer op de company, particulier op het
    // contact zelf. Zonder die tweede bron blijft CIF/NIF leeg op de PDF terwijl
    // de validatie het contact-NIF wél als geldig ziet — een factuur zonder
    // fiscaal nummer is in Spanje niet in orde.
    contactVat: company?.vatNumber ?? doc.contact?.taxId ?? null,
    projectName: doc.project?.name ?? null,
    locale: doc.contact?.preferredLanguage ?? "es",
    signature,
    contractPreview:
      !signature && opts.contract
        ? (() => {
            const lang = contractLang(doc.contact?.preferredLanguage);
            return { lang, articles: contractArticles(lang) };
          })()
        : null,
  });

  const naam = signature || opts.contract ? "Overeenkomst" : kindLabel(doc.kind);
  return { buf, filename: `${naam}-${doc.docNumber ?? doc.id.slice(0, 8)}.pdf` };
}
