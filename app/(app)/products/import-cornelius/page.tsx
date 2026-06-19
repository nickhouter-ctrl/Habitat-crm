import { inArray } from "drizzle-orm";

import { CorneliusImportButton } from "@/components/cornelius-import-button";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import corneliusData from "@/lib/import/cornelius-products.json";

export const metadata = { title: "Cornelius importeren" };
export const dynamic = "force-dynamic";

type CorneliusItem = { sku: string; category: string };

export default async function ImportCorneliusPage() {
  const items = corneliusData as CorneliusItem[];
  const skus = items.map((p) => p.sku).filter(Boolean);

  // Hoeveel staan er al in het CRM? (zodat de melding klopt vóór importeren)
  const existing = skus.length
    ? await db.select({ sku: products.sku }).from(products).where(inArray(products.sku, skus))
    : [];
  const already = existing.length;
  const nieuw = items.length - already;

  const byCat = items.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title="Cornelius Lifestyle importeren"
        subtitle="Voegt de volledige Cornelius-meubelcatalogus toe aan je producten"
        actions={<LinkButton href="/products" variant="secondary">← Producten</LinkButton>}
      />

      <Card className="mb-5 space-y-3 p-5 text-sm">
        <p>
          Dit voegt <strong>{items.length} meubels</strong> toe (naam, SKU, foto, omschrijving en
          verkoopprijs), ingedeeld per meubeltype. Alles komt binnen als{" "}
          <strong>&ldquo;op bestelling&rdquo;</strong>, dus het telt nooit mee in je voorraad. De
          aannemersprijs wordt automatisch 20% onder de verkoopprijs gezet.
        </p>
        <p className="text-muted">
          {already > 0
            ? `${nieuw} hiervan zijn nieuw; ${already} bestaan al (op SKU) en worden overgeslagen.`
            : "Geen van deze SKU's staat nog in het CRM — alle worden toegevoegd."}{" "}
          Nogmaals klikken maakt geen dubbele aan.
        </p>
        <p className="text-muted">
          Let op: de prijs komt rechtstreeks van Cornelius. Controleer zelf of dit incl. of excl.
          BTW is en pas eventueel je verkoopprijs aan. Naar de website pushen doe je later per
          product met de bestaande website-sync.
        </p>
      </Card>

      <Card className="mb-5 p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Categorieën ({cats.length})
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {cats.map(([name, n]) => (
            <span key={name} className="rounded-md bg-background px-2 py-1">
              {name} <span className="text-muted">· {n}</span>
            </span>
          ))}
        </div>
      </Card>

      <CorneliusImportButton total={items.length} />
    </>
  );
}
