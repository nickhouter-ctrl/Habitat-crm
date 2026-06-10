import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { supplierOrderItems, supplierOrders } from "@/lib/db/schema";
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
