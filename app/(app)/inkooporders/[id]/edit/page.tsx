import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { db } from "@/lib/db";
import { products, purchaseOrders } from "@/lib/db/schema";
import { updatePurchaseOrder } from "../../actions";

export const metadata = { title: "Inkooporder bewerken" };

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!order) notFound();

  const productOptions = await db
    .select({ id: products.id, name: products.name, sku: products.sku })
    .from(products)
    .orderBy(asc(products.name));

  const action = updatePurchaseOrder.bind(null, id);

  return (
    <>
      <PageHeader title="Inkooporder bewerken" subtitle={order.supplier} />
      <Card className="p-5">
        <PurchaseOrderForm order={order} products={productOptions} action={action} />
      </Card>
    </>
  );
}
