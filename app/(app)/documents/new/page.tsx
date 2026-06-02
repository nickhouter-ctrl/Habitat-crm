import { count, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { DocumentWizard } from "@/components/document-wizard";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { documents, products, quoteRequests, type DocumentLineItem } from "@/lib/db/schema";
import { asStringArray, suggestDocNumber, type DocKind } from "@/lib/documents";
import { getDocumentFormOptions } from "../../_options";
import { createDocumentFromWizard } from "../actions";
import { documentKindMeta } from "../../_meta";

export const metadata = { title: "Nieuw document" };

const VALID_KINDS: DocKind[] = [
  "estimate",
  "proforma",
  "invoice",
  "creditnote",
  "salesreceipt",
  "deliverynote",
];

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kindParam = typeof params.kind === "string" ? params.kind : "estimate";
  const kind = (VALID_KINDS.includes(kindParam as DocKind) ? kindParam : "estimate") as DocKind;
  const kindLabel = documentKindMeta[kind];

  const [options, [{ n }]] = await Promise.all([
    getDocumentFormOptions(),
    db.select({ n: count() }).from(documents).where(eq(documents.kind, kind)),
  ]);

  const defaults = {
    contactId: typeof params.contactId === "string" ? params.contactId : undefined,
    dealId: typeof params.dealId === "string" ? params.dealId : undefined,
    propertyId: typeof params.propertyId === "string" ? params.propertyId : undefined,
    projectId: typeof params.projectId === "string" ? params.projectId : undefined,
  };
  // Producten uit een (geaccepteerde) aanvraag voorladen als offerte-regels.
  let initialItems: DocumentLineItem[] | undefined;
  const fromAanvraag = typeof params.fromAanvraag === "string" ? params.fromAanvraag : undefined;
  if (fromAanvraag) {
    const req = await db.query.quoteRequests.findFirst({
      where: eq(quoteRequests.id, fromAanvraag),
      columns: { productSkus: true, productNames: true },
    });
    const skus = asStringArray(req?.productSkus);
    const names = asStringArray(req?.productNames);
    if (skus.length > 0) {
      const prods = await db.query.products.findMany({
        where: inArray(products.sku, skus),
        columns: { id: true, name: true, sku: true, priceEur: true, vatRate: true, category: true },
      });
      const bySku = new Map(prods.map((p) => [p.sku, p]));
      initialItems = skus.map((sku, i) => {
        const p = bySku.get(sku);
        if (!p) {
          return { name: names[i] ?? sku, units: 1, price: 0, discount: 0, taxRate: 21, category: "materiaal" };
        }
        return {
          name: p.name,
          units: 1,
          price: Number(p.priceEur ?? 0),
          discount: 0,
          taxRate: p.vatRate ?? 21,
          category: "materiaal",
          productId: p.id,
        };
      });
    }
  }

  const backHref =
    kind === "invoice" ? "/invoices" : kind === "deliverynote" ? "/pakbonnen" : "/quotes";

  return (
    <>
      <PageHeader
        title={`Nieuwe ${kindLabel.toLowerCase()}`}
        subtitle="Stap 1: klant kiezen of aanmaken — stap 2: inhoud & regels"
        actions={
          <Link href={backHref} className="text-sm text-muted hover:underline">
            ← Terug
          </Link>
        }
      />
      {params.error === "client" && (
        <p className="mb-4 max-w-3xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Kies een bestaande klant of vul een naam in voor de nieuwe klant.
        </p>
      )}
      {params.error === "validation" && (
        <p className="mb-4 max-w-3xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Controleer de gegevens en probeer het opnieuw.
        </p>
      )}
      <DocumentWizard
        action={createDocumentFromWizard}
        kind={kind}
        defaultDocNumber={suggestDocNumber(kind, n)}
        contacts={options.contacts}
        deals={options.deals}
        properties={options.properties}
        projects={options.projects}
        products={options.products}
        defaults={defaults}
        initialItems={initialItems}
      />
    </>
  );
}
