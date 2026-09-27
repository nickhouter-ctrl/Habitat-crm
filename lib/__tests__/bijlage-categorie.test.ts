/**
 * Indeling van mailbijlagen — en vooral het vangnet.
 *
 * De instroom van inkoopfacturen pakt alleen bijlagen met een financiële
 * categorie op. Wat op "other" blijft staan komt dus nooit in de keurwachtrij,
 * en dat is stil: er is geen melding, geen kaart, niets. Zo verdwenen tien
 * facturen van CSABAHOME (A196 t/m A216, juli–augustus 2026) terwijl ze gewoon
 * aan purchase@ waren gestuurd — hun bestandsnamen ("INVOICE A214 BENISSA -
 * Google Sheets.pdf") pasten op geen enkele leveranciersregel.
 */
import { describe, expect, it } from "vitest";

import { detectCategory } from "@/lib/email-attachments";

const ctx = (filename: string, extra: Partial<Parameters<typeof detectCategory>[0]> = {}) => ({
  filename,
  contentType: "application/pdf",
  fromEmail: "info@csabahome.com",
  fromName: "Casabahome",
  subject: "invoice",
  allText: `invoice ${filename}`,
  ...extra,
});

describe("vangnet: een bestand dat zichzelf factuur noemt", () => {
  it("herkent de facturen die stil verdwenen", () => {
    for (const naam of [
      "INVOICE A214 BENISSA - Google Sheets.pdf",
      "_INVOICE A216 BENISSA  - INVOICE A216 BENISSA.pdf",
      "INVOICE A212 BENISSA MATERIALS.xlsx - Google Sheets.pdf",
      "INVOICE A203 BENISSA MATERIALS.pdf",
    ]) {
      expect(detectCategory(ctx(naam))).toBe("supplier-invoice");
    }
  });

  it("herkent ook de Spaanse, Franse en Duitse schrijfwijze", () => {
    expect(detectCategory(ctx("Factura 0017-2026.pdf"))).toBe("supplier-invoice");
    expect(detectCategory(ctx("factuur 260073.pdf"))).toBe("supplier-invoice");
    expect(detectCategory(ctx("Rechnung 4711.pdf"))).toBe("supplier-invoice");
  });

  it("laat onze eigen uitgaande documenten met rust", () => {
    expect(detectCategory(ctx("Factuur-FAC-2026-0038.pdf"))).not.toBe("supplier-invoice");
    expect(detectCategory(ctx("Offerte-OFF-2026-0031.pdf"))).not.toBe("supplier-invoice");
  });

  it("pakt geen losse foto of tekening op", () => {
    expect(detectCategory(ctx("plattegrond verdieping 2.pdf", { allText: "plattegrond" }))).toBe("other");
    expect(detectCategory(ctx("IMG_4821.jpg", { allText: "foto" }))).toBe("other");
    // "invoice" zonder nummer is geen factuurbestand maar bijvoorbeeld een
    // handleiding of mailhandtekening.
    expect(detectCategory(ctx("invoicing terms.pdf", { allText: "terms" }))).toBe("other");
  });

  it("laat de specifieke regels voorgaan op het vangnet", () => {
    // Een proforma blijft een proforma, ook al staat "invoice 123" in de naam.
    expect(
      detectCategory(
        ctx("PI invoice 1234.pdf", { allText: "proforma invoice 1234", subject: "PI" }),
      ),
    ).toBe("quote-proforma");
  });
});
