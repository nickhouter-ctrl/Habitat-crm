/**
 * Automatische factuurstatus (dagelijks):
 *  1. betaalstand uit Holded ophalen voor openstaande facturen → betaald/deels;
 *  2. verstuurde/geaccepteerde, nog-openstaande facturen waarvan de vervaldatum
 *     voorbij is → "vervallen" (overdue).
 * Stap 1 leest alleen (geen documenten aanmaken), dus geen dubbele facturen.
 */
import "server-only";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { refreshInvoicePaymentFromHolded } from "@/lib/holded/sync";

export async function runInvoiceStatusSweep(): Promise<{
  ok: boolean;
  checked: number;
  paidUpdated: number;
  markedOverdue: number;
}> {
  // 1. Betaalstand bijwerken vanuit Holded (alleen openstaande met een Holded-id).
  const open = await db
    .select({ id: documents.id, holdedId: documents.holdedId })
    .from(documents)
    .where(
      and(
        eq(documents.kind, "invoice"),
        isNotNull(documents.holdedId),
        notInArray(documents.status, ["paid", "void", "draft"]),
      ),
    );

  let paidUpdated = 0;
  for (const r of open) {
    if (!r.holdedId) continue;
    try {
      const s = await refreshInvoicePaymentFromHolded(r.holdedId);
      if (s === "paid" || s === "partially_paid") paidUpdated++;
    } catch {
      /* per-factuur best-effort */
    }
  }

  // 2. Vervallen markeren (na stap 1, zodat een net-betaalde factuur niet overdue wordt).
  const overdue = await db
    .update(documents)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        eq(documents.kind, "invoice"),
        inArray(documents.status, ["sent", "accepted"]),
        sql`${documents.dueDate} < current_date`,
        sql`coalesce(${documents.totalEur}, 0) - coalesce(${documents.paidEur}, 0) > 0.01`,
      ),
    )
    .returning({ id: documents.id });

  return { ok: true, checked: open.length, paidUpdated, markedOverdue: overdue.length };
}
