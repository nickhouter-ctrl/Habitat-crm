import { eq, inArray } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents, products } from "@/lib/db/schema";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { normalizeDocItems } from "@/lib/documents";

async function fetchImage(url: string): Promise<{ data: Buffer; format: "jpg" | "png" } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const format = url.toLowerCase().includes(".png") ? "png" : "jpg";
    return { data: buf, format };
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: {
      contact: {
        columns: {
          name: true,
          addressLine: true,
          postalCode: true,
          city: true,
          preferredLanguage: true,
        },
      },
      project: { columns: { name: true } },
    },
  });
  if (!doc) return new Response("Not found", { status: 404 });

  const addr =
    [
      doc.contact?.addressLine,
      [doc.contact?.postalCode, doc.contact?.city].filter(Boolean).join(" "),
    ]
      .filter((p) => p && p.trim())
      .join(", ") || null;

  const baseItems = normalizeDocItems(doc.items);

  // Verrijk de regels met SKU; haal voor de pakbon ook de productfoto's op.
  const pids = [...new Set(baseItems.map((it) => it.productId).filter((x): x is string => !!x))];
  const prodRows = pids.length
    ? await db
        .select({ id: products.id, sku: products.sku, imageUrl: products.imageUrl })
        .from(products)
        .where(inArray(products.id, pids))
    : [];
  const prodById = new Map(prodRows.map((p) => [p.id, p]));
  const items = baseItems.map((it) => ({
    ...it,
    sku: it.productId ? (prodById.get(it.productId)?.sku ?? null) : null,
  }));

  let lineImages: Record<string, { data: Buffer; format: "jpg" | "png" }> | undefined;
  if (doc.kind === "deliverynote") {
    lineImages = {};
    const withImg = prodRows.filter((p) => p.imageUrl);
    const fetched = await Promise.all(withImg.map((p) => fetchImage(p.imageUrl as string)));
    withImg.forEach((p, i) => {
      const f = fetched[i];
      if (f) lineImages![p.id] = f;
    });
  }

  const buf = await renderDocumentPdf({
    kind: doc.kind,
    docNumber: doc.docNumber,
    title: doc.title,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    subtotalEur: doc.subtotalEur,
    taxEur: doc.taxEur,
    totalEur: doc.totalEur,
    items,
    notes: doc.notes,
    contactName: doc.contact?.name ?? null,
    contactAddress: addr,
    projectName: doc.project?.name ?? null,
    locale: doc.contact?.preferredLanguage ?? "es",
    lineImages,
  });

  const label = doc.kind === "invoice" ? "Factuur" : "Offerte";
  const filename = `${label}-${doc.docNumber ?? doc.id.slice(0, 8)}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
}
