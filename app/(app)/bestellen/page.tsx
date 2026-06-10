import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { FileDown, Send, Trash2 } from "lucide-react";
import Link from "next/link";

import { auth } from "@/auth";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  catalogCollections,
  catalogProducts,
  catalogVariants,
  companies,
  products,
  purchaseOrders,
  supplierOrderItems,
  supplierOrders,
} from "@/lib/db/schema";
import { displaySku } from "@/lib/catalog";
import { supplierForSku } from "@/lib/suppliers";
import { formatDate, formatEUR } from "@/lib/utils";
import { getProductCollections } from "../_options";
import {
  addManyToOrder,
  addToOrder,
  deleteOrder,
  markOrderSent,
  removeOrderItem,
  updateOrderItem,
  updateOrderMeta,
} from "./actions";
import { OrderSearch } from "./order-search";

export const metadata = { title: "Bestellen" };
export const dynamic = "force-dynamic";

export default async function BestellenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const prefillVariantId = typeof sp.variant === "string" ? sp.variant : "";
  const session = await auth();
  const userId = session!.user!.id!;

  const [prefill] = prefillVariantId
    ? await db
        .select({
          id: catalogVariants.id,
          sku: catalogVariants.sku,
          legacySku: catalogVariants.legacySku,
          color: catalogVariants.colorNameEn,
          productName: catalogProducts.nameEn,
          collectionName: catalogCollections.nameEn,
        })
        .from(catalogVariants)
        .leftJoin(catalogProducts, eq(catalogVariants.productId, catalogProducts.id))
        .leftJoin(catalogCollections, eq(catalogProducts.collectionId, catalogCollections.id))
        .where(eq(catalogVariants.id, prefillVariantId))
        .limit(1)
    : [];

  // Leveranciers voor de datalist: companies(type=supplier) + vrije namen uit inkooporders.
  const [supplierCompanies, poSuppliers] = await Promise.all([
    db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.type, "supplier")),
    db
      .selectDistinct({ name: purchaseOrders.supplier })
      .from(purchaseOrders)
      .where(isNotNull(purchaseOrders.supplier)),
  ]);
  const suppliers = Array.from(
    new Set([...supplierCompanies, ...poSuppliers].map((s) => s.name).filter(Boolean)),
  ).sort() as string[];

  // Bladerlijst met collectie-tabs (zoals de productenpagina) + actuele voorraad.
  const collections = await getProductCollections();
  const colParam = typeof sp.col === "string" ? sp.col.trim() : "";
  const selectedCol = collections.includes(colParam) ? colParam : "";

  const browseProducts = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      collection: products.collection,
      priceEur: products.priceEur,
      purchaseCostEur: products.purchaseCostEur,
      costEur: products.costEur,
      unit: products.unit,
      imageUrl: products.imageUrl,
      stockQty: products.stockQty,
      additionalSizes: products.additionalSizes,
    })
    .from(products)
    .where(selectedCol ? eq(products.collection, selectedCol) : undefined)
    .orderBy(asc(products.category), asc(products.name))
    .limit(2000);

  const browseByCat = new Map<string, typeof browseProducts>();
  for (const p of browseProducts) {
    const key = p.category?.trim() || "Zonder categorie";
    const arr = browseByCat.get(key) ?? [];
    arr.push(p);
    browseByCat.set(key, arr);
  }
  const browseGroups = Array.from(browseByCat.entries());

  // Concepten van deze gebruiker.
  const drafts = await db
    .select()
    .from(supplierOrders)
    .where(and(eq(supplierOrders.createdBy, userId), eq(supplierOrders.status, "draft")))
    .orderBy(supplierOrders.supplierName);

  // Verzonden orders (historie, alle gebruikers).
  const sent = await db
    .select()
    .from(supplierOrders)
    .where(ne(supplierOrders.status, "draft"))
    .orderBy(desc(supplierOrders.sentAt))
    .limit(15);

  const orderIds = [...drafts, ...sent].map((o) => o.id);
  const items = orderIds.length
    ? await db
        .select()
        .from(supplierOrderItems)
        .where(inArray(supplierOrderItems.orderId, orderIds))
    : [];
  const itemsByOrder = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push(it);
    itemsByOrder.set(it.orderId, arr);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bestellen"
        subtitle="Stel bestelbonnen samen voor álle producten en catalogus-samples. Regels worden automatisch per leverancier gegroepeerd."
      />

      {prefill && (
        <Card className="border-accent/40 bg-accent/5">
          <CardHeader>
            <CardTitle>
              Toevoegen: {prefill.productName} — {prefill.color}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addToOrder} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="kind" value="catalog" />
              <input type="hidden" name="refId" value={prefill.id} />
              <input type="hidden" name="supplierName" value="Magic Stone" />
              <span className="text-xs text-muted">
                {prefill.collectionName} · <span className="font-mono">{displaySku(prefill)}</span>
              </span>
              <input
                name="qty"
                type="number"
                min={1}
                step="any"
                defaultValue={1}
                className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm"
              />
              <select
                name="unit"
                defaultValue="stuk"
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="stuk">stuk</option>
                <option value="doos">doos</option>
                <option value="m2">m²</option>
              </select>
              <SubmitButton size="sm">Toevoegen aan bestelbon</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Toevoegen aan een bestelbon</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderSearch suppliers={suppliers} />
        </CardContent>
      </Card>

      {/* alle producten — bladeren per collectie (tabs) */}
      <Card>
        <CardHeader>
          <CardTitle>Producten ({browseProducts.length})</CardTitle>
          <div className="mt-2 flex flex-wrap gap-1">
            <Link
              href="/bestellen"
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                !selectedCol ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface"
              }`}
            >
              Alle
            </Link>
            {collections.map((c) => (
              <Link
                key={c}
                href={`/bestellen?col=${encodeURIComponent(c)}`}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  selectedCol === c ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface"
                }`}
              >
                {c}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <datalist id="browse-suppliers">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {browseGroups.length === 0 ? (
            <p className="p-4 text-sm text-muted">Geen producten gevonden.</p>
          ) : (
            <form action={addManyToOrder}>
              <div className="max-h-[32rem] overflow-y-auto">
                {browseGroups.map(([group, list]) => (
                  <div key={group}>
                    <div className="sticky top-0 z-10 bg-muted/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">
                      {group} ({list.length})
                    </div>
                    <ul className="divide-y divide-border">
                      {list.map((p) => {
                        const sizes =
                          (p.additionalSizes as Array<{
                            sku: string;
                            label: string;
                            purchaseEur?: number | null;
                            costEur?: number | null;
                            stockQty?: number | null;
                          }> | null) ?? [];
                        const stock = p.stockQty != null ? Number(p.stockQty) : 0;
                        return (
                          <li key={p.id} className="flex flex-wrap items-start gap-2 px-4 py-2">
                            <input type="hidden" name="productId" value={p.id} />
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                            ) : (
                              <div className="h-9 w-9 shrink-0 rounded bg-muted" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{p.name}</p>
                              <p className="truncate text-xs text-muted">
                                {p.sku ? <span className="font-mono">{p.sku}</span> : null}
                                {p.purchaseCostEur ? ` · inkoop ${formatEUR(p.purchaseCostEur)}` : ""}
                                {p.costEur ? ` · kostprijs ${formatEUR(p.costEur)}` : ""}
                              </p>
                              {sizes.filter((sz) => sz.label).length > 0 && (
                                <div className="mt-1 overflow-hidden rounded border border-border/60 bg-muted/15 text-[10px]">
                                  <div className="grid grid-cols-[1.1fr_1.2fr_0.6fr_0.9fr_0.9fr] gap-x-2 border-b border-border bg-background/60 px-2 py-0.5 font-medium text-muted">
                                    <span>Afmeting</span>
                                    <span>SKU</span>
                                    <span className="text-right">Vrd</span>
                                    <span className="text-right">Inkoop</span>
                                    <span className="text-right">Kostprijs</span>
                                  </div>
                                  {sizes
                                    .filter((sz) => sz.label)
                                    .map((sz, i) => {
                                      const st = sz.stockQty ?? 0;
                                      return (
                                        <div
                                          key={i}
                                          className="grid grid-cols-[1.1fr_1.2fr_0.6fr_0.9fr_0.9fr] gap-x-2 border-b border-border/30 px-2 py-0.5 last:border-b-0"
                                        >
                                          <span className="tabular-nums">{sz.label.replace(/\*/g, "×")}</span>
                                          <span className="truncate font-mono text-muted">{sz.sku}</span>
                                          <span className={`text-right tabular-nums ${st > 0 ? "text-success" : "text-muted/60"}`}>
                                            {st}
                                          </span>
                                          <span className="text-right tabular-nums text-muted">
                                            {sz.purchaseEur != null ? formatEUR(sz.purchaseEur) : "—"}
                                          </span>
                                          <span className="text-right tabular-nums text-muted">
                                            {sz.costEur != null ? formatEUR(sz.costEur) : "—"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                            <span
                              className={`hidden shrink-0 text-xs sm:inline ${
                                stock > 0 ? "text-success" : "text-muted"
                              }`}
                              title="Actuele voorraad"
                            >
                              {stock > 0 ? `${stock}${p.unit ? " " + p.unit : ""} op voorraad` : "niet op voorraad"}
                            </span>
                            <input
                              name="supplierName"
                              list="browse-suppliers"
                              placeholder="Leverancier"
                              defaultValue={supplierForSku(p.sku)}
                              className="h-8 w-32 rounded-md border border-border bg-background px-2 text-sm"
                            />
                            {sizes.length > 0 ? (
                              <select
                                name="size"
                                className="h-8 w-36 rounded-md border border-border bg-background px-2 text-sm"
                                title="Maat"
                              >
                                <option value="">Standaardmaat</option>
                                {sizes.map((sz) => (
                                  <option key={sz.sku || sz.label} value={sz.label}>
                                    {sz.label}
                                    {(sz.stockQty ?? 0) > 0 ? ` — ${sz.stockQty} op vrd` : ""}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input type="hidden" name="size" value="" />
                            )}
                            <input
                              name="qty"
                              type="number"
                              min={0}
                              step="any"
                              placeholder="0"
                              className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm"
                            />
                            <select
                              name="unit"
                              defaultValue="stuk"
                              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                            >
                              <option value="stuk">stuk</option>
                              <option value="doos">doos</option>
                              <option value="m2">m²</option>
                            </select>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3">
                <p className="text-xs text-muted">
                  Vul aantallen in bij de producten die je wilt bestellen en voeg ze in één keer toe.
                </p>
                <SubmitButton>Toevoegen aan bestelbon</SubmitButton>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* concepten per leverancier */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Concepten ({drafts.length})
        </h2>
        {drafts.length === 0 ? (
          <EmptyState
            title="Nog geen concepten"
            description="Zoek hierboven een product of sample en voeg het toe; per leverancier ontstaat automatisch een bestelbon."
          />
        ) : (
          <div className="space-y-4">
            {drafts.map((o) => {
              const list = itemsByOrder.get(o.id) ?? [];
              return (
                <Card key={o.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle>{o.supplierName}</CardTitle>
                      <p className="text-xs text-muted">{list.length} regels</p>
                    </div>
                    <div className="flex gap-2">
                      <LinkButton href={`/bestellen/${o.id}`} variant="secondary" size="sm">
                        Bekijk &amp; versturen
                      </LinkButton>
                      <form action={deleteOrder}>
                        <input type="hidden" name="id" value={o.id} />
                        <ConfirmSubmit
                          className={buttonClass({ variant: "ghost", size: "sm" })}
                          message="Dit concept verwijderen?"
                        >
                          <Trash2 className="h-4 w-4" />
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* meta */}
                    <form
                      action={updateOrderMeta}
                      className="flex flex-wrap items-end gap-2 border-b border-border pb-3"
                    >
                      <input type="hidden" name="id" value={o.id} />
                      <LabeledMini name="supplierEmail" label="Leverancier e-mail" value={o.supplierEmail} className="w-56" />
                      <LabeledMini name="customerRef" label="Klant / referentie" value={o.customerRef} className="w-44" />
                      <LabeledMini name="notes" label="Notitie" value={o.notes} className="w-56" />
                      <SubmitButton size="sm" variant="secondary">
                        Opslaan
                      </SubmitButton>
                    </form>

                    {/* regels */}
                    {list.length === 0 ? (
                      <p className="text-sm text-muted">Nog geen regels.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {list.map((it) => (
                          <li key={it.id} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 font-mono text-xs">{it.skuSnapshot}</span>
                            <span className="min-w-0 flex-1 truncate text-sm">{it.description}</span>
                            <form action={updateOrderItem} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={it.id} />
                              <input
                                name="size"
                                defaultValue={it.size ?? ""}
                                placeholder="maat"
                                className="h-7 w-20 rounded border border-border bg-background px-1.5 text-xs"
                              />
                              <input
                                name="qty"
                                type="number"
                                min={1}
                                step="any"
                                defaultValue={Number(it.qty)}
                                className="h-7 w-14 rounded border border-border bg-background px-1.5 text-xs"
                              />
                              <select
                                name="unit"
                                defaultValue={it.unit}
                                className="h-7 rounded border border-border bg-background px-1 text-xs"
                              >
                                <option value="stuk">st</option>
                                <option value="doos">doos</option>
                                <option value="m2">m²</option>
                              </select>
                              <SubmitButton size="sm" variant="ghost">
                                ✓
                              </SubmitButton>
                            </form>
                            <form action={removeOrderItem}>
                              <input type="hidden" name="id" value={it.id} />
                              <SubmitButton size="sm" variant="ghost">
                                <Trash2 className="h-3.5 w-3.5" />
                              </SubmitButton>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex gap-2 pt-1">
                      <a
                        href={`/bestellen/${o.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        <FileDown className="h-4 w-4" /> PDF
                      </a>
                      <form action={markOrderSent}>
                        <input type="hidden" name="id" value={o.id} />
                        <ConfirmSubmit
                          className={buttonClass({ size: "sm" })}
                          message={`Bestelbon voor ${o.supplierName} als verstuurd markeren?`}
                        >
                          <Send className="h-4 w-4" /> Markeer als verstuurd
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* historie */}
      {sent.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Verstuurd
          </h2>
          <Card className="divide-y divide-border">
            {sent.map((o) => (
              <Link
                key={o.id}
                href={`/bestellen/${o.id}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/40"
              >
                <span className="text-sm font-medium">{o.supplierName}</span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  {(itemsByOrder.get(o.id) ?? []).length} regels
                  <Badge tone="info">verstuurd</Badge>
                  {o.sentAt ? formatDate(o.sentAt) : ""}
                </span>
              </Link>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function LabeledMini({
  name,
  label,
  value,
  className,
}: {
  name: string;
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted">{label}</span>
      <Input name={name} defaultValue={value ?? ""} className={`h-8 ${className ?? ""}`} />
    </label>
  );
}
