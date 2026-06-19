import { and, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { db } from "@/lib/db";
import { documents, products } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { getReservedStockByProduct } from "@/lib/stock";

export const metadata = { title: "Data-check" };
export const dynamic = "force-dynamic";

type Tone = "danger" | "warning" | "info";
type Issue = {
  key: string;
  title: string;
  tone: Tone;
  why: string;
  items: { label: string; sub?: string; href: string }[];
  /** Optionele snelkoppeling naar een gefilterde lijst i.p.v. losse items. */
  listHref?: string;
};

const toneBadge: Record<Tone, "danger" | "warning" | "info"> = {
  danger: "danger",
  warning: "warning",
  info: "info",
};

function eur(n: number) {
  return n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

export default async function DataCheckPage() {
  const prods = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      isActive: products.isActive,
      stockQty: products.stockQty,
      costEur: products.costEur,
      priceEur: products.priceEur,
      imageUrl: products.imageUrl,
      barcode: products.barcode,
      category: products.category,
    })
    .from(products);

  const invoices = await db.query.documents.findMany({
    where: and(
      eq(documents.kind, "invoice"),
      inArray(documents.status, ["sent", "paid", "partially_paid", "overdue"]),
    ),
    columns: { id: true, docNumber: true, items: true, stockAppliedAt: true, totalEur: true },
  });

  const reserved = await getReservedStockByProduct();

  const prodHref = (id: string) => `/products/${id}/edit`;
  const active = prods.filter((p) => p.isActive);

  const issues: Issue[] = [];

  // 1. Negatieve voorraad
  const negStock = prods.filter((p) => p.stockQty != null && Number(p.stockQty) < 0);
  issues.push({
    key: "neg-stock",
    title: "Negatieve voorraad",
    tone: "danger",
    why: "Voorraad onder 0 betekent dat er meer is afgeboekt dan binnen was — of een afboeking die niet klopt.",
    items: negStock.map((p) => ({
      label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
      sub: `${Number(p.stockQty).toLocaleString("nl-NL")} op voorraad`,
      href: prodHref(p.id),
    })),
  });

  // 2. Oversold: vrije voorraad negatief (meer gereserveerd in offertes dan fysiek)
  const oversold = prods
    .map((p) => ({ p, free: (p.stockQty != null ? Number(p.stockQty) : 0) - (reserved.get(p.id) ?? 0) }))
    .filter((x) => (reserved.get(x.p.id) ?? 0) > 0 && x.free < 0);
  issues.push({
    key: "oversold",
    title: "Meer verkocht dan op voorraad (offertes)",
    tone: "warning",
    why: "Er staat in geaccepteerde offertes meer gereserveerd dan fysiek op voorraad — risico op dubbel verkopen.",
    items: oversold.map((x) => ({
      label: `${x.p.name}${x.p.sku ? ` (${x.p.sku})` : ""}`,
      sub: `${(reserved.get(x.p.id) ?? 0).toLocaleString("nl-NL")} gereserveerd · ${x.free.toLocaleString("nl-NL")} vrij`,
      href: prodHref(x.p.id),
    })),
  });

  // 3. Actief product zonder kostprijs (marge niet te berekenen)
  const noCost = active.filter(
    (p) => Number(p.priceEur ?? 0) > 0 && (p.costEur == null || Number(p.costEur) <= 0),
  );
  issues.push({
    key: "no-cost",
    title: "Actief product zonder kostprijs",
    tone: "warning",
    why: "Zonder kostprijs kan de marge niet berekend worden en kloppen de marge-rapportages niet.",
    items: noCost.map((p) => ({
      label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
      sub: `verkoop ${eur(Number(p.priceEur))}`,
      href: prodHref(p.id),
    })),
  });

  // 4. Kostprijs ≥ verkoopprijs (geen of negatieve marge)
  const badMargin = active.filter(
    (p) => Number(p.costEur ?? 0) > 0 && Number(p.priceEur ?? 0) > 0 && Number(p.costEur) >= Number(p.priceEur),
  );
  issues.push({
    key: "neg-margin",
    title: "Kostprijs ≥ verkoopprijs",
    tone: "danger",
    why: "Je verkoopt met verlies of break-even — controleer of de inkoopkosten of de verkoopprijs kloppen.",
    items: badMargin.map((p) => ({
      label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
      sub: `kost ${eur(Number(p.costEur))} · verkoop ${eur(Number(p.priceEur))}`,
      href: prodHref(p.id),
    })),
  });

  // 5. Verdacht hoge/lage marge binnen dezelfde categorie (zoals de XPS-platen)
  // Vlag actieve producten waarvan de marge% > 25 procentpunt afwijkt van de
  // mediaan van hun categorie — duidt vaak op een inkoopkosten-invoerfout.
  const marginByCat = new Map<string, { id: string; name: string; sku: string | null; pct: number }[]>();
  for (const p of active) {
    const price = Number(p.priceEur ?? 0);
    const cost = Number(p.costEur ?? 0);
    if (price <= 0 || cost <= 0) continue;
    const pct = Math.round(((price - cost) / price) * 100);
    const cat = p.category?.trim() || "—";
    if (!marginByCat.has(cat)) marginByCat.set(cat, []);
    marginByCat.get(cat)!.push({ id: p.id, name: p.name, sku: p.sku, pct });
  }
  const marginOutliers: Issue["items"] = [];
  for (const [cat, list] of marginByCat) {
    if (list.length < 3) continue; // mediaan heeft genoeg datapunten nodig
    const sorted = [...list].sort((a, b) => a.pct - b.pct);
    const median = sorted[Math.floor(sorted.length / 2)].pct;
    for (const x of list) {
      if (Math.abs(x.pct - median) >= 25) {
        marginOutliers.push({
          label: `${x.name}${x.sku ? ` (${x.sku})` : ""}`,
          sub: `marge ${x.pct}% · categorie-mediaan ${median}% (${cat})`,
          href: prodHref(x.id),
        });
      }
    }
  }
  issues.push({
    key: "margin-outlier",
    title: "Marge wijkt sterk af van categorie",
    tone: "warning",
    why: "Een marge die ver van de rest van de categorie ligt, komt vaak door een verkeerde inkoopkost (zoals eerder bij de grote XPS-platen).",
    items: marginOutliers,
  });

  // 6. Facturen met productregels die de voorraad nog niet afboekten
  const unbooked = invoices
    .filter((d) => !d.stockAppliedAt)
    .map((d) => ({ d, lines: normalizeDocItems(d.items).filter((it) => it.productId && it.units) }))
    .filter((x) => x.lines.length > 0);
  issues.push({
    key: "invoice-unbooked",
    title: "Verstuurde/betaalde factuur zonder voorraad-afboeking",
    tone: "warning",
    why: "Deze facturen hebben productregels maar de voorraad is niet afgeboekt — je voorraad staat dan te hoog.",
    items: unbooked.map((x) => ({
      label: `Factuur ${x.d.docNumber ?? x.d.id.slice(0, 8)}`,
      sub: `${x.lines.length} productregel(s) · ${eur(Number(x.d.totalEur ?? 0))}`,
      href: `/documents/${x.d.id}`,
    })),
  });

  // 7. Actieve producten zonder foto / barcode / verkoopprijs (snelkoppelingen)
  const noPhoto = active.filter((p) => !p.imageUrl);
  issues.push({
    key: "no-photo",
    title: "Actief product zonder foto",
    tone: "info",
    why: "Zonder foto staat het product niet netjes op de website en in offertes.",
    items: noPhoto.slice(0, 8).map((p) => ({
      label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
      href: prodHref(p.id),
    })),
    listHref: "/products?nofoto=1",
  });
  const noPrice = active.filter((p) => p.priceEur == null || Number(p.priceEur) <= 0);
  issues.push({
    key: "no-price",
    title: "Actief product zonder verkoopprijs",
    tone: "warning",
    why: "Een product zonder prijs kan niet correct op een offerte of factuur belanden.",
    items: noPrice.map((p) => ({
      label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
      href: prodHref(p.id),
    })),
  });
  const noBarcode = active.filter((p) => !p.barcode);
  issues.push({
    key: "no-barcode",
    title: "Actief product zonder barcode",
    tone: "info",
    why: "Zonder barcode/GTIN werken labels en scannen niet en mist het op de website-feed.",
    items: noBarcode.slice(0, 8).map((p) => ({
      label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
      href: prodHref(p.id),
    })),
    listHref: "/products?nobarcode=1",
  });

  const withCounts = issues.map((i) => ({
    ...i,
    // Voor de checks met een listHref tellen we de echte totalen apart mee.
    count:
      i.key === "no-photo"
        ? noPhoto.length
        : i.key === "no-barcode"
          ? noBarcode.length
          : i.items.length,
  }));
  const totalIssues = withCounts.reduce((s, i) => s + i.count, 0);
  const clean = withCounts.filter((i) => i.count === 0).length;

  // Voortgang unieke meertalige meubelteksten (SEO) — Cornelius + Caracole.
  const furnitureDescRows = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${products.descriptionI18n} is not null)::int`,
    })
    .from(products)
    .where(
      and(
        inArray(products.collection, ["Cornelius Lifestyle", "Caracole"]),
        eq(products.isActive, true),
      ),
    );
  const fd = furnitureDescRows[0] ?? { total: 0, done: 0 };

  return (
    <>
      <PageHeader
        title="Data-gezondheid"
        subtitle="Controleert of producten, prijzen, voorraad en facturen consistent zijn — en met elkaar kloppen."
        actions={
          <LinkButton href="/rapporten" variant="ghost">
            ← Rapporten
          </LinkButton>
        }
      />

      {totalIssues === 0 ? (
        <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm font-medium text-success">
          ✓ Geen problemen gevonden — alle gecontroleerde data is consistent.
        </div>
      ) : (
        <div className="mb-5 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <strong>{totalIssues}</strong> aandachtspunt(en) over {withCounts.length - clean} categorie(ën).
          {clean > 0 && <span className="text-muted"> · {clean} categorie(ën) schoon ✓</span>}
        </div>
      )}

      {fd.total > 0 && (
        <div className="mb-5 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          Unieke meubelteksten (SEO): <strong>{fd.done}/{fd.total}</strong> meubels met eigen
          meertalige omschrijving.
          {fd.done < fd.total && (
            <span className="text-muted">
              {" "}
              · de rest volgt automatisch zodra <code>AI_DESCRIPTIONS_ENABLED</code> aanstaat.
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {withCounts.map((issue) => (
          <Card key={issue.key} className={issue.count === 0 ? "opacity-60" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {issue.title}
                <Badge tone={issue.count === 0 ? "success" : toneBadge[issue.tone]}>
                  {issue.count === 0 ? "✓" : issue.count}
                </Badge>
              </CardTitle>
              {issue.listHref && issue.count > 0 && (
                <Link href={issue.listHref} className="text-xs text-accent hover:underline">
                  Alle bekijken →
                </Link>
              )}
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted">{issue.why}</p>
              {issue.count === 0 ? (
                <p className="text-sm text-success">Niets gevonden ✓</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {issue.items.map((it, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1 last:border-0">
                      <Link href={it.href} className="font-medium hover:underline">
                        {it.label}
                      </Link>
                      {it.sub && <span className="shrink-0 text-xs text-muted">{it.sub}</span>}
                    </li>
                  ))}
                  {issue.listHref && issue.count > issue.items.length && (
                    <li className="pt-1 text-xs text-muted">
                      + {issue.count - issue.items.length} meer —{" "}
                      <Link href={issue.listHref} className="text-accent hover:underline">
                        bekijk alle
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
