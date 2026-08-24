import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { purchaseOrders, workers } from "@/lib/db/schema";
import type { POSupplierOption } from "@/components/purchase-order-form";

/**
 * Namen voor het leveranciersveld op het inkoopformulier: eerst de eigen ploeg
 * (die tikte je tot nu toe met de hand over, en één afwijkende schrijfwijze
 * betekent dat de uren niet aan zijn arbeiderskaart gekoppeld worden), daarna de
 * leveranciers waar al eens iets van binnenkwam.
 */
export async function supplierNameOptions(): Promise<POSupplierOption[]> {
  const [ploeg, eerder] = await Promise.all([
    db
      .select({ name: workers.name, tarief: workers.hourlyCostEur })
      .from(workers)
      .where(eq(workers.active, true))
      .orderBy(asc(workers.name)),
    db
      .select({ name: purchaseOrders.supplier, laatst: sql<string>`max(${purchaseOrders.orderDate})` })
      .from(purchaseOrders)
      .groupBy(purchaseOrders.supplier)
      .orderBy(desc(sql`max(${purchaseOrders.orderDate})`))
      .limit(200),
  ]);

  const uit: POSupplierOption[] = [];
  const gezien = new Set<string>();
  for (const w of ploeg) {
    const naam = w.name.trim();
    if (!naam || gezien.has(naam.toLowerCase())) continue;
    gezien.add(naam.toLowerCase());
    uit.push({ name: naam, hint: w.tarief ? `ploeg · € ${Number(w.tarief)}/u` : "ploeg" });
  }
  for (const s of eerder) {
    const naam = (s.name ?? "").trim();
    if (!naam || gezien.has(naam.toLowerCase())) continue;
    gezien.add(naam.toLowerCase());
    uit.push({ name: naam, hint: "eerdere leverancier" });
  }
  return uit;
}
