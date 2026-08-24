import { asc } from "drizzle-orm";

import { Card, PageHeader } from "@/components/ui";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { supplierNameOptions } from "@/lib/supplier-options";
import { createPurchaseOrder } from "../actions";

export const metadata = { title: "Inkoop toevoegen" };

export default async function NewPurchaseOrderPage() {
  const [productOptions, suppliers] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, sku: products.sku })
      .from(products)
      .orderBy(asc(products.name)),
    supplierNameOptions(),
  ]);

  return (
    <>
      <PageHeader title="Inkoop toevoegen" subtitle="Bestelling, of een binnengekomen factuur/bon (werknemer, materialen…) met de PDF eronder." />
      <Card className="p-5">
        <PurchaseOrderForm products={productOptions} suppliers={suppliers} action={createPurchaseOrder} />
      </Card>
    </>
  );
}
