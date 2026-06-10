import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { catalogVariants, products, supplierOrderItems, supplierOrders } from "@/lib/db/schema";
import { renderSupplierOrderPdf } from "@/lib/supplier-order-pdf";
import { formatDate } from "@/lib/utils";

export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { orderId } = await params;
  const order = await db.query.supplierOrders.findFirst({
    where: eq(supplierOrders.id, orderId),
  });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const items = await db
    .select()
    .from(supplierOrderItems)
    .where(eq(supplierOrderItems.orderId, orderId))
    .orderBy(asc(supplierOrderItems.skuSnapshot));

  // Productfoto's per regel ophalen (product óf catalogusvariant).
  const productIds = items.map((i) => i.productId).filter((v): v is string => !!v);
  const variantIds = items.map((i) => i.catalogVariantId).filter((v): v is string => !!v);
  const [prodImgs, varImgs] = await Promise.all([
    productIds.length
      ? db
          .select({ id: products.id, image: products.imageUrl })
          .from(products)
          .where(inArray(products.id, productIds))
      : Promise.resolve([] as { id: string; image: string | null }[]),
    variantIds.length
      ? db
          .select({ id: catalogVariants.id, image: catalogVariants.imageUrl })
          .from(catalogVariants)
          .where(inArray(catalogVariants.id, variantIds))
      : Promise.resolve([] as { id: string; image: string | null }[]),
  ]);
  const imgByProduct = new Map(prodImgs.map((r) => [r.id, r.image]));
  const imgByVariant = new Map(varImgs.map((r) => [r.id, r.image]));

  const pdf = await renderSupplierOrderPdf({
    orderNumber: order.id.slice(0, 8).toUpperCase(),
    dateLabel: formatDate(order.createdAt),
    supplierName: order.supplierName,
    supplierEmail: order.supplierEmail,
    customerRef: order.customerRef,
    notes: order.notes,
    items: items.map((it) => ({
      sku: it.skuSnapshot,
      description: it.description,
      size: it.size,
      qty: String(Number(it.qty)),
      unit: it.unit,
      image: it.productId
        ? imgByProduct.get(it.productId) ?? null
        : it.catalogVariantId
          ? imgByVariant.get(it.catalogVariantId) ?? null
          : null,
    })),
  });

  const filename = `bestelbon-${order.supplierName}-${order.id.slice(0, 8)}.pdf`.replace(
    /[^a-z0-9.-]/gi,
    "-",
  );
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
}
