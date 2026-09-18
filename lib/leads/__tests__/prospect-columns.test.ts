import { describe, expect, it } from "vitest";

import { fieldForHeader, rowToProspect, suggestMapping } from "@/lib/leads/prospect-columns";

describe("fieldForHeader", () => {
  it("herkent dezelfde kolom in drie talen", () => {
    for (const kop of ["Bedrijfsnaam", "Empresa", "Company name", "Razón social"]) {
      expect(fieldForHeader(kop)).toBe("companyName");
    }
    for (const kop of ["E-mail", "Correo electrónico", "Email address", "mailadres"]) {
      expect(fieldForHeader(kop)).toBe("email");
    }
    for (const kop of ["Postcode", "Código postal", "CP", "Zip code"]) {
      expect(fieldForHeader(kop)).toBe("postalCode");
    }
  });

  it("trekt zich niets aan van accenten, hoofdletters, dubbele spaties en een dubbele punt", () => {
    expect(fieldForHeader("  CORREO   ELECTRÓNICO: ")).toBe("email");
    expect(fieldForHeader("Población")).toBe("city");
  });

  it("geeft null bij een kop die we niet kennen", () => {
    expect(fieldForHeader("Nº empleados")).toBeNull();
    expect(fieldForHeader("")).toBeNull();
  });
});

describe("suggestMapping", () => {
  it("koppelt een Spaanse kopregel en meldt wat onbekend is", () => {
    const v = suggestMapping(["Empresa", "Correo electrónico", "Teléfono", "Nº empleados", "Ciudad"]);
    expect(v.mapping).toEqual(["companyName", "email", "phone", null, "city"]);
    expect(v.onbekend).toEqual([{ index: 3, kop: "Nº empleados" }]);
    expect(v.ontbreekt).toEqual([]);
  });

  it("meldt de bedrijfsnaam als die ontbreekt", () => {
    expect(suggestMapping(["Correo", "Ciudad"]).ontbreekt).toEqual(["companyName"]);
  });

  it("laat de eerste van twee gelijke kolommen winnen", () => {
    const v = suggestMapping(["Empresa", "Email 1", "Email"]);
    expect(v.mapping).toEqual(["companyName", "email", null]);
    expect(v.onbekend.map((o) => o.kop)).toEqual(["Email"]);
  });

  it("negeert een lege kop in de melding", () => {
    expect(suggestMapping(["Empresa", ""]).onbekend).toEqual([]);
  });
});

describe("rowToProspect", () => {
  const koppen = ["Empresa", "Correo", "Nº empleados", "Extra"];

  it("zet cellen in de juiste velden", () => {
    const r = rowToProspect(["García SL", "info@garcia.es", "10-50", ""], ["companyName", "email", "tag", "ignore"], koppen);
    expect(r.companyName).toBe("García SL");
    expect(r.email).toBe("info@garcia.es");
    expect(r.tags).toEqual(["Nº empleados: 10-50"]);
  });

  it("laat lege cellen weg in plaats van er een leeg veld van te maken", () => {
    const r = rowToProspect(["García SL", "  ", "", ""], ["companyName", "email", "tag", "ignore"], koppen);
    expect(r.email).toBeUndefined();
    expect(r.tags).toBeUndefined();
  });

  it("neemt een kolom op ignore niet mee", () => {
    const r = rowToProspect(["García SL", "geheim", "", ""], ["companyName", "ignore", "ignore", "ignore"], koppen);
    expect(Object.values(r)).toEqual(["García SL"]);
  });
});
