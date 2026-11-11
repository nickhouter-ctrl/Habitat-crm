import { describe, expect, it } from "vitest";
import {
  bookingProblems,
  bookingTotals,
  buildDraftLines,
  changedFromProposal,
  effectiveRate,
  holdedPurchaseBody,
  verifyRemote,
  type HoldedPushLine,
} from "../holded/purchase-booking";
import { historyLineKind, suggestBooking, type HistoryLine } from "../holded/purchase-learning";

const taxes = [
  { key: "p_iva_21", name: "IVA 21%", amount: "21", group: "iva" },
  { key: "p_iva_10", name: "IVA 10%", amount: "10", group: "iva" },
  { key: "p_iva_0", name: "IVA 0%", amount: "0", group: "iva" },
  { key: "p_iva_invsuj", name: "Inv. Suj. Pasivo", amount: null, group: "iva" },
  { key: "p_iva_invsuj_2", name: "Inv. Suj. Pasivo (-)", amount: "21", group: "iva" },
  { key: "p_ret_15", name: "Retención 15%", amount: "-15", group: "retention" },
  { key: "p_ret_7", name: "Retención 7%", amount: "-7", group: "retention" },
];
const taxMap = new Map(taxes.map((t) => [t.key, t]));
const names = new Map([["silv", "Silvestre"], ["lisa", "Finca Lisa"], ["show", "Showroom"]]);

describe("buildDraftLines — zoals bij het keuren verdeeld", () => {
  it("Wilhelmus over drie werven + reiskosten naar rato: één regel per werf, uren × tarief", () => {
    const lines = buildDraftLines({
      exVat: 1350 + 180,
      poProjectId: null,
      countAsLabor: true,
      timeEntries: [
        { projectId: "silv", workerName: "Wilhelmus", hours: 36, rate: 27 },
        { projectId: "lisa", workerName: "Wilhelmus", hours: 6, rate: 27 },
        { projectId: "show", workerName: "Wilhelmus", hours: 8, rate: 27 },
      ],
      costs: [
        { projectId: "silv", category: "other", description: "Reiskosten · inkoopfactuur 0-15", amount: 129.6 },
        { projectId: "lisa", category: "other", description: "Reiskosten · inkoopfactuur 0-15", amount: 21.6 },
        { projectId: "show", category: "other", description: "Reiskosten · inkoopfactuur 0-15", amount: 28.8 },
      ],
      projectNames: names,
      fallbackDesc: "x",
    });
    expect(lines.map((l) => [l.kind, l.name, l.units, l.price])).toEqual([
      ["labor", "Silvestre", 36, 27],
      ["labor", "Finca Lisa", 6, 27],
      ["labor", "Showroom", 8, 27],
      ["transport", "Silvestre", 1, 129.6],
      ["transport", "Finca Lisa", 1, 21.6],
      ["transport", "Showroom", 1, 28.8],
    ]);
    expect(lines[3].desc).toBe("Reiskosten");
    expect(lines.every((l) => l.crmProjectId)).toBe(true);
  });

  it("tarief dat niet op de cent uitkomt (€ 3.000 / 107,14 u) → 1 × bedrag, uren in de omschrijving", () => {
    const [l] = buildDraftLines({
      exVat: 3000, poProjectId: null, countAsLabor: true,
      timeEntries: [{ projectId: "silv", workerName: "Ferhaoui", hours: 107.14, rate: 3000 / 107.14 }],
      costs: [], projectNames: names, fallbackDesc: "x",
    });
    expect([l.units, l.price]).toEqual([1, 3000]);
    expect(l.desc).toContain("107,14 uur");
  });

  it("Pieter: vervoer, transport en afval op één werf worden één transportregel", () => {
    const lines = buildDraftLines({
      exVat: 300, poProjectId: null, countAsLabor: true,
      timeEntries: [{ projectId: "silv", workerName: "Pieter", hours: 8, rate: 30 }],
      costs: [
        { projectId: "silv", category: "other", description: "Vervoer · inkoopfactuur 260079", amount: 20 },
        { projectId: "silv", category: "other", description: "Transport · inkoopfactuur 260079", amount: 30 },
        { projectId: "silv", category: "other", description: "Afval · inkoopfactuur 260079", amount: 10 },
      ],
      projectNames: names, fallbackDesc: "x",
    });
    expect(lines.map((l) => [l.kind, l.desc, l.price])).toEqual([
      ["labor", "Pieter · 8 uur", 30],
      ["transport", "Vervoer, Transport, Afval", 60],
    ]);
  });

  it("materiaal op één werf zonder verdeling → één regel voor het hele bedrag ex btw", () => {
    const lines = buildDraftLines({ exVat: 28.74, poProjectId: "silv", countAsLabor: false, timeEntries: [], costs: [], projectNames: names, fallbackDesc: "Bricoman 26-10" });
    expect(lines).toEqual([expect.objectContaining({ kind: "material", crmProjectId: "silv", name: "Silvestre", units: 1, price: 28.74 })]);
  });
});

const line = (p: Partial<HoldedPushLine>): HoldedPushLine => ({
  key: "a", kind: "labor", crmProjectId: "silv", holdedProjectId: "h1", name: "Silvestre", desc: "", units: 1, price: 100, account: "acc", vat: "p_iva_21", retention: null, ...p,
});

describe("totalen en controle op de cent", () => {
  it("21% btw met 15% IRPF", () => {
    expect(bookingTotals([line({ units: 10, price: 30, retention: "p_ret_15" })], taxMap)).toEqual({ subtotal: 300, vat: 63, retention: 45, total: 318 });
  });
  it("verlegde btw (ISP) telt niet mee in wat je betaalt", () => {
    expect(effectiveRate(taxMap.get("p_iva_invsuj"))).toBe(0);
    expect(effectiveRate(taxMap.get("p_iva_invsuj_2"))).toBe(0);
    expect(bookingTotals([line({ price: 4992, vat: "p_iva_invsuj" })], taxMap).total).toBe(4992);
  });
  it("weigert als regels niet op het factuurbedrag sluiten of rekening/project ontbreekt", () => {
    const lines = [line({ price: 100, account: null }), line({ key: "b", price: 50, holdedProjectId: null })];
    const p = bookingProblems({ lines, totals: bookingTotals(lines, taxMap), exVat: 160, invoiceTotal: 193.6, contactId: "c", docNumber: "15" });
    expect(p.join(" ")).toMatch(/grootboekrekening/);
    expect(p.join(" ")).toMatch(/Holded-project/);
    expect(p.join(" ")).toMatch(/150,00 ex btw.*160,00/);
  });
  it("in orde: geen problemen", () => {
    const lines = [line({ price: 100 })];
    expect(bookingProblems({ lines, totals: bookingTotals(lines, taxMap), exVat: 100, invoiceTotal: 121, contactId: "c", docNumber: "15" })).toEqual([]);
  });
});

describe("body en controle achteraf", () => {
  it("concept, met rekening, project en btw/IRPF per regel en de CRM-markering", () => {
    const b = holdedPurchaseBody({ poId: "p1", contactId: "c1", docNumber: " 15 ", date: "2026-11-02", supplier: "Wilhelmus", lines: [line({ retention: "p_ret_15" })] });
    expect(b).toMatchObject({ contactId: "c1", invoiceNum: "15", docNumber: "15", tags: ["crm-po-p1"] });
    expect((b.items as unknown[])[0]).toEqual({ name: "Silvestre", desc: "", units: 1, subtotal: 100, tax: 21, taxes: ["p_iva_21", "p_ret_15"], accountingAccountId: "acc", projectid: "h1" });
  });
  it("meldt als Holded een ander bedrag, rekening of project heeft opgeslagen", () => {
    const sent = { docNumber: "15", lines: [line({})], totals: { subtotal: 100, vat: 21, retention: 0, total: 121 } };
    expect(verifyRemote({ docNumber: "15", subtotal: 100, total: 121, products: [{ account: "acc", projectid: "h1" }] }, sent)).toEqual([]);
    expect(verifyRemote({ docNumber: "15", subtotal: 100, total: 100, products: [{ account: "x", projectid: null }] }, sent)).toHaveLength(3);
  });
  it("telt aangepaste regels t.o.v. het voorstel", () => {
    expect(changedFromProposal([line({}), line({ key: "b" })], [line({}), line({ key: "b", account: "ander" })])).toBe(1);
  });
});

describe("leren van de Holded-historie", () => {
  // Zo boekt Holded het nu voor Hollandse Meesters: uren 215, transport 2818, materiaal 602.
  const h: HistoryLine[] = [
    { contact: "hm", date: 1, name: "Silvestre", desc: "draden trekken", units: 8, price: 30, account: "a215", taxes: ["p_iva_21"] },
    { contact: "hm", date: 2, name: "Capnegre", desc: "controle", units: 2, price: 30, account: "a215", taxes: ["p_iva_21"] },
    { contact: "hm", date: 3, name: "Transport", desc: "woon werk", units: 5, price: 20, account: "a2818", taxes: ["p_iva_21"] },
    { contact: "hm", date: 4, name: "Silvestre", desc: "kabel", units: 1, price: 412.5, account: "a602", taxes: ["p_iva_21"] },
    { contact: "fer", date: 5, name: "Palijsje", desc: "periodo", units: 192, price: 26, account: "a602", taxes: ["p_iva_0"] },
    { contact: "cre", date: 6, name: "Huur", desc: "", units: 1, price: 2550, account: "a621", taxes: ["p_iva_21", "p_ret_15"] },
  ];
  it("herkent de soort regel in de historie", () => {
    expect(h.map(historyLineKind)).toEqual(["labor", "labor", "transport", "material", "labor", "material"]);
  });
  it("kiest per leverancier én soort de rekening", () => {
    const s = (kind: "labor" | "material" | "transport") =>
      suggestBooking({ history: h, contactId: "hm", kind, vatRate: 21, vatExempt: false, retentionPct: null, taxes }).account;
    expect([s("labor"), s("transport"), s("material")]).toEqual(["a215", "a2818", "a602"]);
  });
  it("btw volgt de factuur; bij verlegde btw neemt hij de 0%-sleutel die al gebruikt werd", () => {
    expect(suggestBooking({ history: h, contactId: "fer", kind: "labor", vatRate: 21, vatExempt: true, retentionPct: null, taxes }).vat).toBe("p_iva_0");
  });
  it("IRPF alleen als de factuur hem noemt", () => {
    expect(suggestBooking({ history: h, contactId: "cre", kind: "material", vatRate: 21, vatExempt: false, retentionPct: 15, taxes }).retention).toBe("p_ret_15");
    expect(suggestBooking({ history: h, contactId: "cre", kind: "material", vatRate: 21, vatExempt: false, retentionPct: null, taxes }).retention).toBeNull();
  });
  it("onbekende leverancier: meest gebruikte rekening voor die soort", () => {
    const r = suggestBooking({ history: h, contactId: "nieuw", kind: "transport", vatRate: 21, vatExempt: false, retentionPct: null, taxes });
    expect(r.account).toBe("a2818");
    expect(r.basis).toMatch(/alle leveranciers/);
  });
});
