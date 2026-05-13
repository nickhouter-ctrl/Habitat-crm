import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { rateToEur } from "@/lib/fx";
import { anthropicConfigured, extractPurchaseOrderFromPdf } from "@/lib/pdf-extract";
import { uploadPurchaseOrderFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normSku(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[\s._/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Kon het bestand niet lezen." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });

  let attachment: { name: string; path: string; size: number; uploadedAt: string };
  try {
    const up = await uploadPurchaseOrderFile(file);
    attachment = { ...up, uploadedAt: new Date().toISOString() };
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload mislukt." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const parsed = await extractPurchaseOrderFromPdf(bytes, file.name);

  if (!parsed) {
    return NextResponse.json({
      attachment,
      parsed: null,
      note: anthropicConfigured()
        ? "Kon de PDF niet automatisch uitlezen — vul de regels handmatig in."
        : "Automatisch uitlezen staat uit (ANTHROPIC_API_KEY ontbreekt). Het bestand is wel toegevoegd.",
    });
  }

  // Match parsed SKUs to catalogue products so receiving can update stock.
  const crm = await db.select({ id: products.id, sku: products.sku, name: products.name }).from(products);
  const bySku = new Map(crm.filter((p) => p.sku).map((p) => [normSku(p.sku), p]));

  // Lijnen die geen voorraad-impact hebben (kortingen, samples e.d.).
  const SKIP_NEW_RX = /(korting|discount|sample|monster|voorbeeld)/i;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  // Live koers (ECB via Frankfurter); valt terug op een veilige default als de bron onbereikbaar is.
  const fxRate = await rateToEur(parsed.currency);
  const fxToEur = (n: number) => r2((Number(n) || 0) * fxRate);

  let linked = 0;
  let created = 0;
  const items: (typeof parsed.items[number] & { productId?: string })[] = [];
  for (const it of parsed.items) {
    const key = it.sku ? normSku(it.sku) : "";
    const match = key ? bySku.get(key) : undefined;
    if (match) {
      linked++;
      items.push({ ...it, productId: match.id });
      continue;
    }
    // Onbekende regel: maak automatisch een product aan als er een SKU + naam zijn
    // en het géén korting/sample-regel is.
    const sku = (it.sku ?? "").trim();
    const isCreatable =
      sku && it.name && (it.units ?? 0) > 0 && !SKIP_NEW_RX.test(it.name) && (it.unitPrice ?? 0) > 0;
    if (!isCreatable) {
      items.push({ ...it });
      continue;
    }
    const purchase = r2(fxToEur(Number(it.unitPrice) || 0));
    const cost = r2(purchase * 1.61);
    const freight = r2(purchase * 0.46);
    const other = r2(cost - purchase - freight);
    const docNote = `Auto-aangemaakt uit ${parsed.reference ? `PI ${parsed.reference}` : "geüploade PI"} op ${new Date().toLocaleDateString("nl-NL")}.${(parsed.currency ?? "EUR").toUpperCase() !== "EUR" ? ` Prijs omgerekend van ${parsed.currency?.toUpperCase()}; controleer.` : " Controleer kostprijs en categorie."}`;
    const [row] = await db
      .insert(products)
      .values({
        name: it.name,
        sku,
        unit: "stuk",
        vatRate: 21,
        purchaseCostEur: String(purchase),
        freightCostEur: String(freight),
        otherCostEur: String(other),
        costEur: String(cost),
        priceEur: null,
        targetMarginPct: null,
        description: [it.note, docNote].filter(Boolean).join(" — "),
        currency: "EUR",
        isActive: true,
      })
      .returning({ id: products.id });
    bySku.set(key, { id: row.id, sku, name: it.name });
    created++;
    items.push({ ...it, productId: row.id });
  }

  return NextResponse.json({
    attachment,
    parsed: { ...parsed, items },
    linked,
    created,
    note:
      `PDF uitgelezen: ${items.length} regel(s)` +
      (linked ? `, ${linked} gekoppeld aan bestaand product` : "") +
      (created ? `, ${created} nieuw aangemaakt (controleer kostprijs/categorie op /products)` : "") +
      ".",
  });
}
