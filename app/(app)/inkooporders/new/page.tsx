import { asc, eq, ne } from "drizzle-orm";

import { Card, PageHeader } from "@/components/ui";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { db } from "@/lib/db";
import { products, projects, workers } from "@/lib/db/schema";
import { supplierNameOptions } from "@/lib/supplier-options";
import { createPurchaseOrder } from "../actions";

export const metadata = { title: "Inkoop toevoegen" };

export default async function NewPurchaseOrderPage() {
  const [productOptions, suppliers, projectRows, workerRows] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, sku: products.sku })
      .from(products)
      .orderBy(asc(products.name)),
    supplierNameOptions(),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(ne(projects.status, "archived"))
      .orderBy(asc(projects.name)),
    db
      .select({ id: workers.id, name: workers.name, hourlyCostEur: workers.hourlyCostEur })
      .from(workers)
      .where(eq(workers.active, true))
      .orderBy(asc(workers.name)),
  ]);
  const workerOptions = workerRows.map((w) => ({
    id: w.id,
    name: w.name,
    hourlyCostEur: w.hourlyCostEur != null ? Number(w.hourlyCostEur) : null,
  }));

  return (
    <>
      <PageHeader title="Inkoop toevoegen" subtitle="Bestelling, of een binnengekomen factuur/bon (werknemer, materialen…) met de PDF eronder." />
      <Card className="p-5">
        <PurchaseOrderForm
          products={productOptions}
          suppliers={suppliers}
          projects={projectRows}
          workers={workerOptions}
          action={createPurchaseOrder}
        />
      </Card>
    </>
  );
}
