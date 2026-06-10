import { asc, eq, isNotNull, isNull } from "drizzle-orm";

import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  LinkButton,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { db } from "@/lib/db";
import { catalogCollections, catalogProducts, catalogVariants, products } from "@/lib/db/schema";
import { matchVariant } from "../actions";
import { MatchSearch } from "./match-search";

export const metadata = { title: "Catalogus koppelen" };
export const dynamic = "force-dynamic";

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9À-ſ ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const focus = typeof sp.variant === "string" ? sp.variant : "";

  const unmatched = await db
    .select({
      id: catalogVariants.id,
      color: catalogVariants.colorNameEn,
      sku: catalogVariants.sku,
      productName: catalogProducts.nameEn,
      collectionName: catalogCollections.nameEn,
    })
    .from(catalogVariants)
    .leftJoin(catalogProducts, eq(catalogVariants.productId, catalogProducts.id))
    .leftJoin(catalogCollections, eq(catalogProducts.collectionId, catalogCollections.id))
    .where(
      focus ? eq(catalogVariants.id, focus) : isNull(catalogVariants.existingProductId),
    )
    .orderBy(asc(catalogCollections.sortOrder), asc(catalogProducts.nameEn))
    .limit(focus ? 1 : 60);

  const [total, matched] = await Promise.all([
    db.$count(catalogVariants),
    db.$count(catalogVariants, isNotNull(catalogVariants.existingProductId)),
  ]);

  // alle producten met SKU voor JS-scoring van suggesties
  const candidates = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      collection: products.collection,
      category: products.category,
    })
    .from(products)
    .where(isNotNull(products.sku));

  const candTokens = candidates.map((c) => ({
    c,
    t: new Set(tokens(`${c.name} ${c.collection ?? ""} ${c.category ?? ""}`)),
  }));

  function suggest(variant: { productName: string | null; color: string; collectionName: string | null }) {
    const want = tokens(`${variant.productName ?? ""} ${variant.color} ${variant.collectionName ?? ""}`);
    return candTokens
      .map(({ c, t }) => ({ c, score: want.reduce((n, w) => n + (t.has(w) ? 1 : 0), 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogus koppelen"
        subtitle="Koppel catalogusvarianten aan bestaande producten. Bestaande SKU wordt overgenomen; bestaande SKU's worden nooit gewijzigd."
        actions={<LinkButton href="/samplecatalogus" variant="secondary">← Terug</LinkButton>}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Totaal varianten" value={String(total)} tone="neutral" />
        <StatTile label="Gekoppeld" value={String(matched)} tone="success" />
        <StatTile
          label="Nog te koppelen"
          value={String(total - matched)}
          tone="warning"
        />
      </div>

      {unmatched.length === 0 ? (
        <EmptyState title="Niets te koppelen" description="Alle varianten zijn gekoppeld." />
      ) : (
        <div className="space-y-3">
          {unmatched.map((v) => {
            const suggestions = suggest(v);
            return (
              <Card key={v.id}>
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {v.productName} — {v.color}
                    </p>
                    <p className="text-xs text-muted">
                      {v.collectionName} · <span className="font-mono">{v.sku}</span>
                    </p>
                    <MatchSearch variantId={v.id} />
                  </div>

                  <div className="flex flex-col items-stretch gap-1.5 md:w-80">
                    {suggestions.length === 0 ? (
                      <span className="text-xs text-muted">Geen automatische suggestie.</span>
                    ) : (
                      suggestions.map(({ c, score }) => (
                        <form
                          key={c.id}
                          action={matchVariant}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                        >
                          <input type="hidden" name="variantId" value={v.id} />
                          <input type="hidden" name="productId" value={c.id} />
                          <span className="min-w-0 truncate text-xs">
                            {c.name} <span className="font-mono text-muted">{c.sku}</span>
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge tone={score >= 2 ? "success" : "neutral"}>{score}×</Badge>
                            <SubmitButton size="sm" variant="secondary">
                              Koppel
                            </SubmitButton>
                          </div>
                        </form>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
