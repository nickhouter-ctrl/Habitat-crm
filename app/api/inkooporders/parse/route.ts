import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
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
  let linked = 0;
  const items = parsed.items.map((it) => {
    const match = it.sku ? bySku.get(normSku(it.sku)) : undefined;
    if (match) linked++;
    return { ...it, productId: match?.id };
  });

  return NextResponse.json({
    attachment,
    parsed: { ...parsed, items },
    linked,
    note: `PDF uitgelezen: ${items.length} regel(s), ${linked} gekoppeld aan een bestaand product.`,
  });
}
