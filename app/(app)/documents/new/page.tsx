import { and, eq, inArray, isNull, or } from "drizzle-orm";
import Link from "next/link";

import { DocumentWizard } from "@/components/document-wizard";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { documents, productVariants, products, quoteRequests, type DocumentLineItem } from "@/lib/db/schema";
import { codeSleutel, offerteRegelsUitAanvraag, type CatalogusTreffer } from "@/lib/aanvraag-regels";
import { asStringArray, type DocKind } from "@/lib/documents";
import { nextDocNumber } from "@/lib/doc-number";
import { getDocumentFormOptions } from "../../_options";
import { createDocumentFromWizard } from "../actions";
import { documentKindMeta } from "../../_meta";

export const metadata = { title: "Nieuw document" };

const VALID_KINDS: DocKind[] = [
  "estimate",
  "proforma",
  "invoice",
  "creditnote",
  "fondos",
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

  const [options, defaultDocNumber] = await Promise.all([
    getDocumentFormOptions(),
    nextDocNumber(kind),
  ]);

  const defaults = {
    contactId: typeof params.contactId === "string" ? params.contactId : undefined,
    dealId: typeof params.dealId === "string" ? params.dealId : undefined,
    propertyId: typeof params.propertyId === "string" ? params.propertyId : undefined,
    projectId: typeof params.projectId === "string" ? params.projectId : undefined,
    sourceDocumentId: typeof params.sourceDocumentId === "string" ? params.sourceDocumentId : undefined,
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
    if (skus.length > 0 || names.length > 0) {
      // De configurator op de website stuurt de code van de UITVOERING mee
      // ("BRA-5-GK-159"), niet die van het product. Alleen in `products` zoeken
      // vond negen van de tien codes van Donny Verboom niet, en die regels
      // kwamen zonder prijs binnen. Daarom beide tabellen.
      const treffers = new Map<string, CatalogusTreffer>();
      if (skus.length > 0) {
        const [prods, varianten] = await Promise.all([
          db.query.products.findMany({
            where: inArray(products.sku, skus),
            columns: { id: true, name: true, sku: true, priceEur: true, vatRate: true, category: true },
          }),
          db
            .select({
              sku: productVariants.sku,
              label: productVariants.label,
              priceEur: productVariants.priceEur,
              productId: products.id,
              productNaam: products.name,
              vatRate: products.vatRate,
              productPrijs: products.priceEur,
            })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(inArray(productVariants.sku, skus)),
        ]);
        for (const p of prods) {
          treffers.set(codeSleutel(p.sku), {
            productId: p.id,
            naam: p.name,
            prijsEur: p.priceEur != null ? Number(p.priceEur) : null,
            btw: p.vatRate,
            categorie: p.category,
          });
        }
        // Een uitvoering wint van het product: hij is specifieker gevraagd.
        for (const v of varianten) {
          treffers.set(codeSleutel(v.sku), {
            productId: v.productId,
            naam: v.productNaam,
            uitvoering: v.label,
            code: v.sku,
            prijsEur: v.priceEur != null ? Number(v.priceEur) : v.productPrijs != null ? Number(v.productPrijs) : null,
            btw: v.vatRate,
          });
        }
      }
      const gevraagd = (skus.length > 0 ? skus : names).map((waarde, i) =>
        skus.length > 0 ? { sku: waarde, naam: names[i] ?? null } : { sku: null, naam: waarde },
      );
      initialItems = offerteRegelsUitAanvraag(gevraagd, treffers);
    }
  }

  // Bij een definitieve factuur op een project: reeds betaalde, nog niet
  // verrekende voorschotten (proforma's én als voorschot gemarkeerde facturen)
  // alvast als negatieve "reeds betaald"-regels voorladen. De aftrek krijgt
  // DEZELFDE BTW als het voorschot, zodat het eindbedrag én de af te dragen btw
  // kloppen. De advanceRef markeert het voorschot bij opslaan als verrekend.
  if (kind === "invoice" && defaults.projectId) {
    const voorschotten = await db.query.documents.findMany({
      where: and(
        eq(documents.projectId, defaults.projectId),
        eq(documents.status, "paid"),
        isNull(documents.advanceSettledAt),
        or(eq(documents.kind, "proforma"), eq(documents.isAdvance, true)),
      ),
      columns: { id: true, docNumber: true, subtotalEur: true, taxEur: true, totalEur: true },
    });
    const negLines: DocumentLineItem[] = voorschotten
      .filter((v) => Number(v.subtotalEur ?? v.totalEur ?? 0) > 0)
      .map((v) => {
        const net = Number(v.subtotalEur ?? 0) || Number(v.totalEur ?? 0);
        const rate = Number(v.subtotalEur ?? 0) > 0 ? Math.round((Number(v.taxEur ?? 0) / Number(v.subtotalEur)) * 100) : 0;
        return {
          name: `Reeds betaald voorschot ${v.docNumber ?? ""}`.trim(),
          units: 1,
          price: -net,
          discount: 0,
          taxRate: rate,
          category: "materiaal",
          advanceRef: v.id,
        };
      });
    if (negLines.length) initialItems = [...(initialItems ?? []), ...negLines];
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
        defaultDocNumber={defaultDocNumber}
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
