import { normalizeDocItems } from "@/lib/documents";

export type StockReservationDocument = {
  kind: string;
  status: string;
  items: unknown;
  projectId: string | null;
  reservedAt: Date | string | null;
  stockAppliedAt: Date | string | null;
};

export function isReservedEstimate(doc: StockReservationDocument): boolean {
  return doc.kind === "estimate" && !["rejected", "void"].includes(doc.status)
    && (doc.status === "accepted" || doc.reservedAt != null);
}

/** One calculation for both the product list and its reservation details. */
export function reservedStockGroups(docs: StockReservationDocument[]) {
  const groups = new Map<string, { productId: string; projectId: string | null; reserved: number; booked: number; remaining: number }>();
  for (const doc of docs) {
    const reserved = isReservedEstimate(doc);
    // A draft/unbooked invoice or delivery note does not fulfil a reservation.
    const booked = ["invoice", "deliverynote"].includes(doc.kind) && doc.stockAppliedAt != null;
    if (!reserved && !booked) continue;
    for (const item of normalizeDocItems(doc.items)) {
      const units = Number(item.units);
      if (!item.productId || !Number.isFinite(units) || !units) continue;
      const key = `${item.productId}|${doc.projectId ?? "__none__"}`;
      const group = groups.get(key) ?? { productId: item.productId, projectId: doc.projectId, reserved: 0, booked: 0, remaining: 0 };
      if (reserved) group.reserved += units;
      if (booked) group.booked += units;
      groups.set(key, group);
    }
  }
  for (const group of groups.values()) group.remaining = Math.max(0, group.reserved - group.booked);
  return [...groups.values()];
}
