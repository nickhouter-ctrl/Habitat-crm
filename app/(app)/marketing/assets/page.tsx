/**
 * Beeldbibliotheek (brief §5): rasterweergave van alle assets met filters op
 * bron, product, categorie en tags. Beelden waarvan de organische IG-post
 * bovengemiddeld scoorde krijgen een markering — een hint, geen bewijs (§8).
 * Een beeld aanklikken opent "Maak creative" (editor van fase 3).
 */
import { and, desc, eq, ilike, or, sql, arrayContains } from "drizzle-orm";
import { Search, Sparkles } from "lucide-react";
import Link from "next/link";

import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { AssetToolbar } from "@/components/marketing/assets/asset-toolbar";
import { db } from "@/lib/db";
import { assets, products } from "@/lib/db/schema";
import { marketingStorage } from "@/lib/marketing/storage";
import { formatDuration } from "@/lib/marketing/video";
import { cn } from "@/lib/utils";

export const metadata = { title: "Beeldbibliotheek" };

const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  instagram: "Instagram",
  upload: "Upload",
  generated: "Gegenereerd",
};

/** Publieke URL, of null als Storage (nog) niet is geconfigureerd (dev). */
function safeUrl(path: string): string | null {
  try {
    return marketingStorage().publicUrl(path);
  } catch {
    return null;
  }
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const source = typeof params.source === "string" ? params.source : "";
  const productId = typeof params.product === "string" ? params.product : "";
  const category = typeof params.category === "string" ? params.category : "";
  const tag = typeof params.tag === "string" ? params.tag.trim() : "";

  const rows = await db
    .select({
      asset: assets,
      productName: products.name,
      productCategory: products.category,
    })
    .from(assets)
    .leftJoin(products, eq(assets.productId, products.id))
    .where(
      and(
        source && source in SOURCE_LABELS
          ? eq(assets.source, source as "website" | "instagram" | "upload" | "generated")
          : undefined,
        productId ? eq(assets.productId, productId) : undefined,
        category ? eq(products.category, category) : undefined,
        tag ? arrayContains(assets.tags, [tag]) : undefined,
        q
          ? or(
              ilike(assets.sourceRef, `%${q}%`),
              ilike(products.name, `%${q}%`),
              sql`exists (select 1 from unnest(coalesce(${assets.tags}, '{}')) as t where t ilike ${"%" + q + "%"})`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(assets.createdAt))
    .limit(500);

  // Filteropties uit de data zelf — alleen wat er echt is.
  const productOptions = await db
    .selectDistinct({ id: products.id, name: products.name })
    .from(assets)
    .innerJoin(products, eq(assets.productId, products.id))
    .orderBy(products.name);
  const categoryOptions = (
    await db
      .selectDistinct({ category: products.category })
      .from(assets)
      .innerJoin(products, eq(assets.productId, products.id))
  )
    .map((r) => r.category)
    .filter((c): c is string => !!c)
    .sort();
  const topTags = (await db.execute(sql`
    select t as tag, count(*)::int as n
    from ${assets}, unnest(coalesce(${assets.tags}, '{}')) as t
    group by t order by n desc, t asc limit 15
  `)) as unknown as Array<{ tag: string }>;
  const tagOptions = (Array.isArray(topTags) ? topTags : []).map((r) => r.tag);

  // Drempel voor de IG-markering: bovengemiddeld organisch bereik (§8).
  const [igAgg] = await db
    .select({
      avgReach: sql<string | null>`avg((${assets.igMetrics} ->> 'reach')::numeric)`,
    })
    .from(assets)
    .where(sql`${assets.igMetrics} ->> 'reach' is not null`);
  const avgReach = igAgg?.avgReach ? Number(igAgg.avgReach) : null;

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (source) sp.set("source", source);
    if (productId) sp.set("product", productId);
    if (category) sp.set("category", category);
    if (tag) sp.set("tag", tag);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `/marketing/assets?${s}` : "/marketing/assets";
  };

  return (
    <>
      <PageHeader
        title="Beeldbibliotheek"
        subtitle={`${rows.length} ${rows.length === 1 ? "beeld" : "beelden"}${
          source ? ` uit ${SOURCE_LABELS[source]}` : ""
        }${category ? ` in ${category}` : ""}${tag ? ` met tag "${tag}"` : ""}${q ? ` voor "${q}"` : ""}`}
        actions={<AssetToolbar />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Bron-tabs */}
        <nav aria-label="Filter op bron" className="flex flex-wrap gap-1">
          {[["", "Alle"], ...Object.entries(SOURCE_LABELS)].map(([value, label]) => (
            <Link
              key={value || "alle"}
              href={buildHref({ source: value || undefined })}
              aria-current={source === value ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                source === value
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Product/categorie + zoeken — GET-formulier, werkt zonder JS. */}
        <form className="flex flex-wrap items-center gap-2" action="/marketing/assets">
          {source && <input type="hidden" name="source" value={source} />}
          {tag && <input type="hidden" name="tag" value={tag} />}
          <label className="sr-only" htmlFor="asset-product">
            Filter op product
          </label>
          <select
            id="asset-product"
            name="product"
            defaultValue={productId}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Alle producten</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="asset-category">
            Filter op categorie
          </label>
          <select
            id="asset-category"
            name="category"
            defaultValue={category}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Alle categorieën</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Zoek op naam, product of tag…"
              className="w-56 pl-8"
              aria-label="Zoeken in de beeldbibliotheek"
            />
          </div>
          <button type="submit" className="sr-only">
            Filteren
          </button>
        </form>
      </div>

      {/* Tag-chips */}
      {tagOptions.length > 0 && (
        <nav aria-label="Filter op tag" className="mb-4 flex flex-wrap gap-1">
          {tagOptions.map((t) => (
            <Link
              key={t}
              href={buildHref({ tag: tag === t ? undefined : t })}
              aria-current={tag === t ? "page" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                tag === t
                  ? "border-accent bg-accent/10 font-medium text-accent"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              #{t}
            </Link>
          ))}
        </nav>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={q || source || tag ? "Geen beelden gevonden" : "Nog geen beelden"}
          description={
            q || source || tag
              ? "Pas de filters of zoekopdracht aan."
              : "Vul de bibliotheek via 'Sync website', 'Sync Instagram' of een handmatige upload hierboven."
          }
        />
      ) : (
        <ul
          className="grid list-none grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          aria-label="Beelden"
        >
          {rows.map(({ asset, productName }) => {
            const url = safeUrl(asset.storagePath);
            const isVideo = asset.mediaType === "video";
            const posterUrl = asset.thumbnailPath ? safeUrl(asset.thumbnailPath) : null;
            const reach = asset.igMetrics?.reach;
            const organicStrong = avgReach != null && reach != null && reach > avgReach;
            const alt = productName ?? asset.sourceRef ?? "Beeld zonder naam";
            return (
              <li key={asset.id}>
                <Card className="group relative overflow-hidden p-0">
                  {isVideo ? (
                    // Video: afspeelbare preview in de kaart. Geen editor-link —
                    // de creative-editor is image-only; een video wordt als
                    // video-ad gepubliceerd met copy uit copy_blocks (U7).
                    url ? (
                      <video
                        src={url}
                        poster={posterUrl ?? undefined}
                        controls
                        preload="none"
                        playsInline
                        className="aspect-square w-full bg-black object-contain"
                        aria-label={`Video: ${alt}`}
                      />
                    ) : (
                      <span className="flex aspect-square w-full items-center justify-center text-xs text-muted">
                        Opslag niet geconfigureerd
                      </span>
                    )
                  ) : (
                    <Link
                      href={`/marketing/creatives/new?assetId=${asset.id}`}
                      className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      aria-label={`Maak creative met ${alt}`}
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={alt}
                          loading="lazy"
                          width={asset.width ?? undefined}
                          height={asset.height ?? undefined}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <span className="flex aspect-square w-full items-center justify-center text-xs text-muted">
                          Opslag niet geconfigureerd
                        </span>
                      )}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-xs font-medium text-white group-hover:block group-focus-within:block">
                        Maak creative →
                      </span>
                    </Link>
                  )}
                  <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
                    <Badge tone="neutral" className="bg-background/85 text-[10px]">
                      {SOURCE_LABELS[asset.source] ?? asset.source}
                    </Badge>
                    {isVideo && (
                      <Badge tone="info" className="bg-background/85 text-[10px]">
                        ▶ {formatDuration(asset.durationSeconds)}
                      </Badge>
                    )}
                    {organicStrong && (
                      <span
                        title={`Organisch sterk op Instagram: bereik ${reach!.toLocaleString("nl-NL")} (boven het gemiddelde van ${Math.round(avgReach!).toLocaleString("nl-NL")}). Een hint, geen bewijs.`}
                      >
                        <Badge tone="success" className="bg-background/85 text-[10px]">
                          <Sparkles className="mr-0.5 inline size-3" aria-hidden />
                          Organisch sterk
                        </Badge>
                      </span>
                    )}
                  </div>
                  <div className="border-t border-border/60 px-3 py-2 text-xs">
                    <p className="truncate font-medium">{alt}</p>
                    <p className="truncate text-muted">
                      {[
                        asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
                        (asset.tags ?? []).length > 0 ? (asset.tags ?? []).map((t) => `#${t}`).join(" ") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
