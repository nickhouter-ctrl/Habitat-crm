import { asc } from "drizzle-orm";

import { Card, PageHeader } from "@/components/ui";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { createPurchaseOrder } from "../actions";

export const metadata = { title: "Nieuwe inkooporder" };

export default async function NewPurchaseOrderPage() {
  const productOptions = await db
    .select({ id: products.id, name: products.name, sku: products.sku })
    .from(products)
    .orderBy(asc(products.name));

  return (
    <>
      <PageHeader title="Nieuwe inkooporder" subtitle="Leveranciersbestelling toevoegen." />
      <Card className="p-5">
        <PurchaseOrderForm products={productOptions} action={createPurchaseOrder} />
      </Card>
    </>
  );
}
