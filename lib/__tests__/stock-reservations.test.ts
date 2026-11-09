import { describe, expect, it } from "vitest";
import { isReservedEstimate, reservedStockGroups, type StockReservationDocument } from "../stock-reservations";

const estimate: StockReservationDocument = { kind: "estimate", status: "draft", projectId: "montgo",
  reservedAt: new Date("2026-06-30"), stockAppliedAt: null, items: [{ productId: "xps", units: 148 }] };
const remaining = (docs: StockReservationDocument[]) => reservedStockGroups(docs).find(g => g.productId === "xps")?.remaining ?? 0;

describe("stock reservations shown on product list and detail", () => {
  it("keeps the manually reserved XPS quote visible while its delivery note is draft", () => {
    expect(remaining([estimate, { ...estimate, kind: "deliverynote", reservedAt: null }])).toBe(148);
  });
  it("counts accepted quotes and excludes rejected, void and unreserved drafts", () => {
    expect(isReservedEstimate({ ...estimate, reservedAt: null, status: "accepted" })).toBe(true);
    for (const status of ["rejected", "void"]) expect(remaining([{ ...estimate, status }])).toBe(0);
    expect(remaining([{ ...estimate, reservedAt: null }])).toBe(0);
  });
  it("deducts only physically booked quantities of the same product and project", () => {
    const booked = { ...estimate, kind: "deliverynote", stockAppliedAt: new Date(), items: [{ productId: "xps", units: 40 }] };
    expect(remaining([estimate, booked])).toBe(108);
    expect(remaining([estimate, { ...booked, projectId: "other" }])).toBe(148);
    expect(remaining([estimate, { ...booked, items: [{ productId: "door", units: 40 }] }])).toBe(148);
    expect(remaining([estimate, { ...booked, kind: "invoice", stockAppliedAt: null }])).toBe(148);
  });
  it("handles legacy double-encoded lines and avoids negative reservations", () => {
    expect(remaining([{ ...estimate, items: JSON.stringify(JSON.stringify(estimate.items)) }])).toBe(148);
    expect(remaining([estimate, { ...estimate, kind: "invoice", stockAppliedAt: new Date(), items: [{ productId: "xps", units: 200 }] }])).toBe(0);
  });
});
