import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/storage", () => ({}));
vi.mock("@/lib/excel-to-pdf", () => ({}));
vi.mock("@/lib/holded/purchase-push", () => ({}));

import { autoPushProblems, cleanDocNumber, mergePdfs, werkOmschrijving } from "@/lib/autopilot/labor-holded";

const line = { key: "u0", kind: "labor" as const, crmProjectId: "p1", name: "Villa Yojosa (penthouse)", desc: "", units: 31, price: 30, holdedProjectId: "h1", account: "a215", vat: "p_iva_21", retention: null, basis: "zoals eerder bij deze leverancier (uren, 71×)" };
const ctx = { blocked: null, existing: null, contact: { matched: { id: "c", name: "Hollandse Meesters", taxId: "X" }, how: "nif" as const, candidates: [], canCreate: false }, lines: [line], ai: null };

describe("Holded-autopush urenfactuur", () => {
  it("schoon factuurnummer", () => {
    expect(cleanDocNumber("260090 Pieter")).toBe("260090");
    expect(cleanDocNumber(null, "Pieter Hoogendijk 260089 Luis")).toBe("260089");
    expect(cleanDocNumber("260089 en 260090")).toBeNull();
  });
  it("alles bekend → mag", () => {
    expect(autoPushProblems(ctx, "260090")).toEqual([]);
  });
  it("weigert bij twijfel", () => {
    expect(autoPushProblems({ ...ctx, lines: [{ ...line, holdedProjectId: null }] }, "260090")).toEqual(["Villa Yojosa (penthouse): geen Holded-project gekoppeld"]);
    expect(autoPushProblems({ ...ctx, lines: [{ ...line, basis: "meest gebruikt voor uren bij alle leveranciers" }] }, "260090")[0]).toMatch(/grootboekrekening niet zeker/);
    expect(autoPushProblems({ ...ctx, contact: { ...ctx.contact, how: "naam" } }, "260090")).toContain("leverancier niet op NIF gevonden in Holded");
    expect(autoPushProblems({ ...ctx, existing: { id: "d", docNumber: "260090", total: 1, draft: false } }, "260090")[0]).toMatch(/staat al in Holded/);
    expect(autoPushProblems(ctx, null)).toContain("geen eenduidig factuurnummer");
  });
  it("omschrijving zoals in Holded", () => {
    expect(werkOmschrijving("PIETER HOOGENDIJK", ["electra leidingen", "electra leidingen", "led verlichting"])).toBe("Pieter — electra leidingen; led verlichting");
  });
  it("voegt PDF's samen", async () => {
    const one = async (n: number) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage(); return d.save(); };
    const merged = await PDFDocument.load(await mergePdfs([await one(1), await one(2)]));
    expect(merged.getPageCount()).toBe(3);
  });
});
