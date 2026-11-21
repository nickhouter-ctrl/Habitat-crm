import { describe, expect, it } from "vitest";
import { v1ToV2Purchase } from "@/lib/holded/purchase-v2";
import { holdedPurchaseBody } from "@/lib/holded/purchase-booking";

describe("Holded v1 → v2 inkoopfactuur", () => {
  it("zet project, rekening, nummer en datum goed over", () => {
    const v1 = holdedPurchaseBody({ poId: "po1", contactId: "c1", docNumber: "260090", date: "2026-11-21", supplier: "Pieter Hoogendijk", lines: [
      { key: "u0", kind: "labor", crmProjectId: "p", name: "Villa Yojosa", desc: "Pieter — electra", units: 31, price: 30, holdedProjectId: "hp1", account: "acc215", vat: "p_iva_21", retention: null },
    ] });
    const v2 = v1ToV2Purchase(v1 as never) as { contact_id: string; number: string; date: string; currency: string; items: unknown[] };
    expect(v2.contact_id).toBe("c1");
    expect(v2.number).toBe("260090");
    expect(v2.date).toBe("2026-11-21");
    expect(v2.currency).toBe("EUR");
    expect(v2.items).toEqual([{ name: "Villa Yojosa", description: "Pieter — electra", units: 31, price: 30, taxes: ["p_iva_21"], account: "acc215", project_id: "hp1" }]);
  });
});
