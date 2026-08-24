import { describe, expect, it } from "vitest";

import { isProformaOrQuote, isSpecificationAttachment } from "@/lib/invoice-attachment-kind";
import { matchWorkerByName, naamHoortBij } from "@/lib/purchase-orders";

describe("isSpecificationAttachment", () => {
  it("herkent de urenverantwoording die Wilhelmus naast zijn factuur stuurt", () => {
    expect(isSpecificationAttachment("JUSTIFICACION HORAS N°4 WILHELMUS.xlsx")).toBe(true);
    expect(isSpecificationAttachment("JUSTIFICACION HORAS N°3  WILHELMUS.xlsx")).toBe(true);
  });

  it("laat de factuur zelf met rust — die is de te-betalen post", () => {
    expect(isSpecificationAttachment("factura N° 4 WILHELMUS.xlsx")).toBe(false);
    expect(isSpecificationAttachment("FRA. 0012 HABITAT ONE & ONE S.L..pdf")).toBe(false);
    expect(isSpecificationAttachment("Ahmed A0016 B.pdf")).toBe(false);
  });

  it("herkent ook de Nederlandse en Spaanse varianten", () => {
    for (const naam of [
      "urenverantwoording week 33.pdf",
      "specificatie uren.xlsx",
      "desglose de horas.pdf",
      "albaran 4471.pdf",
      "pakbon 8871.pdf",
    ]) {
      expect(isSpecificationAttachment(naam), naam).toBe(true);
    }
  });

  it("staat los van de proforma-regel — een proforma is iets anders dan een specificatie", () => {
    expect(isSpecificationAttachment("PI for PJ0050481.pdf")).toBe(false);
    expect(isProformaOrQuote("PI for PJ0050481.pdf")).toBe(true);
  });
});

describe("matchWorkerByName", () => {
  const ploeg = [
    { id: "a", name: "FERHAOUI MOHAMED" },
    { id: "b", name: "Wilhelmus Strijks" },
    { id: "c", name: "Abdelmjid" },
  ];

  it("vindt de arbeider ongeacht hoofdletters", () => {
    expect(matchWorkerByName("Ferhaoui Mohamed", ploeg)?.id).toBe("a");
  });

  it("vindt hem ook als de factuur meer namen draagt dan de kaart", () => {
    expect(matchWorkerByName("Zerghini Abdelmjid", ploeg)?.id).toBe("c");
  });

  it("geeft niets terug bij een onbekende leverancier", () => {
    expect(matchWorkerByName("KingKonree International", ploeg)).toBeNull();
    expect(matchWorkerByName("", ploeg)).toBeNull();
    expect(matchWorkerByName(null, ploeg)).toBeNull();
  });

  it("gokt niet als twee arbeiders passen", () => {
    const dubbel = [
      { id: "x", name: "Mohamed" },
      { id: "y", name: "Mohamed Ferhaoui" },
    ];
    expect(matchWorkerByName("Mohamed Ferhaoui", dubbel)).toBeNull();
  });
});

describe("naamHoortBij", () => {
  it("herkent een factuurnaam met een naam extra", () => {
    // Zijn ploegkaart heet "Wilhelmus Strijks", zijn facturen "Wilhelmus Mark
    // Strijks" — aan elkaar geplakt bevat geen van beide de ander.
    expect(naamHoortBij("Wilhelmus Strijks", "Wilhelmus Mark Strijks")).toBe(true);
    expect(naamHoortBij("Abdelmjid", "Zerghini Abdelmjid")).toBe(true);
    expect(naamHoortBij("FERHAOUI MOHAMED", "Ferhaoui Mohamed")).toBe(true);
  });

  it("houdt verschillende mensen uit elkaar", () => {
    expect(naamHoortBij("Wilhelmus Strijks", "Pieter Hoogendijk")).toBe(false);
    expect(naamHoortBij("Ahmed Bouzekri", "Ahmed Javea")).toBe(false);
  });

  it("negeert een toevoeging tussen haakjes en de rechtsvorm niet ten onrechte", () => {
    expect(naamHoortBij("Ahmed Bouzekri", "Ahmed Bouzekri (Construcciones Ahmed Javea)")).toBe(true);
  });

  it("valt niet om op lege namen", () => {
    expect(naamHoortBij("", "Wilhelmus")).toBe(false);
    expect(naamHoortBij("Wilhelmus", null)).toBe(false);
  });
});
