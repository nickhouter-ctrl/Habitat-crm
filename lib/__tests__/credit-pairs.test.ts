import { describe, expect, it } from "vitest";
import { gecrediteerdeParen } from "@/lib/credit-pairs";

const regels = [{ name: "Shower Glass", units: 3, price: 820 }, { name: "Mirror", units: 6, price: 200 }];

describe("gecrediteerdeParen", () => {
  it("koppelt een factuur aan de creditnota die hem volledig terugdraait", () => {
    const paren = gecrediteerdeParen([
      { id: "f", kind: "invoice", status: "overdue", docNumber: "FAC-2026-0031", amount: "3660", items: regels },
      { id: "cn", kind: "creditnote", status: "sent", docNumber: "CN-2026-0031-2", amount: "3660", items: regels },
      { id: "andere", kind: "invoice", status: "paid", docNumber: "F260009", amount: "3660", items: [{ name: "Warmtepomp", units: 1, price: 3660 }] },
    ]);
    expect([...paren].sort()).toEqual(["cn", "f"]);
  });

  it("laat een gedeeltelijke creditnota en zijn factuur staan", () => {
    expect(gecrediteerdeParen([
      { id: "f", kind: "invoice", status: "sent", amount: 1000, items: regels },
      { id: "cn", kind: "creditnote", status: "sent", amount: 400, items: [{ name: "Mirror", units: 2, price: 200 }] },
    ]).size).toBe(0);
  });

  it("valt zonder regels terug op het nummer", () => {
    const paren = gecrediteerdeParen([
      { id: "f1", kind: "invoice", status: "sent", docNumber: "F260012", amount: "8179.56" },
      { id: "f2", kind: "invoice", status: "sent", docNumber: "F260099", amount: "8179.56" },
      { id: "cn", kind: "creditnote", status: "sent", docNumber: "CN-F260012", amount: "8179.56" },
    ]);
    expect([...paren].sort()).toEqual(["cn", "f1"]);
  });

  it("koppelt één creditnota maar aan één factuur, en negeert concepten", () => {
    const paren = gecrediteerdeParen([
      { id: "f1", kind: "invoice", status: "sent", amount: 100, items: regels },
      { id: "f2", kind: "invoice", status: "sent", amount: 100, items: regels },
      { id: "cn", kind: "creditnote", status: "sent", amount: 100, items: regels },
      { id: "concept", kind: "creditnote", status: "draft", amount: 100, items: regels },
    ]);
    expect(paren.size).toBe(2);
  });
});
