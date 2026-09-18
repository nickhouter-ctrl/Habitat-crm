import { describe, expect, it } from "vitest";

import { isRoleAddress, normalizeEmail, prospectCompanyKey } from "@/lib/leads/normalize";

describe("normalizeEmail", () => {
  it("brengt hoofdletters, spaties en punthaken op één vorm", () => {
    expect(normalizeEmail("  Info@Empresa.ES ")).toBe("info@empresa.es");
    expect(normalizeEmail("Ana García <ana@empresa.es>")).toBe("ana@empresa.es");
    expect(normalizeEmail("mailto:X@Y.com")).toBe("x@y.com");
    expect(normalizeEmail("info@empresa.es; ventas@empresa.es")).toBe("info@empresa.es");
  });

  it("weigert wat geen adres is", () => {
    for (const ruw of [null, undefined, "", "   ", "info", "info@", "@empresa.es", "a@b", "a b@c.es", "a@@b.es", "a@b..es", ".a@b.es", "a.@b.es", "a@-b.es"]) {
      expect(normalizeEmail(ruw)).toBeNull();
    }
  });

  it("weigert een adres dat langer is dan 254 tekens", () => {
    expect(normalizeEmail(`${"a".repeat(250)}@empresa.es`)).toBeNull();
  });

  it("laat plusadressen en puntjes met rust — dat zijn andere postvakken", () => {
    expect(normalizeEmail("john.doe+leads@empresa.es")).toBe("john.doe+leads@empresa.es");
  });
});

describe("isRoleAddress", () => {
  it("herkent adressen waar geen mens achter zit", () => {
    for (const e of ["noreply@empresa.es", "no-reply@empresa.es", "postmaster@empresa.es", "abuse@empresa.es", "mailer-daemon@empresa.es"]) {
      expect(isRoleAddress(e)).toBe(true);
    }
  });

  it("laat functionele postvakken staan — die willen we juist mailen", () => {
    for (const e of ["info@empresa.es", "administracion@empresa.es", "ventas@empresa.es", "hola@empresa.es"]) {
      expect(isRoleAddress(e)).toBe(false);
    }
  });
});

describe("prospectCompanyKey", () => {
  it("laat schrijfwijzen en rechtsvormen samenvallen", () => {
    expect(prospectCompanyKey("Reformas García S.L.", "Dénia")).toBe(prospectCompanyKey("reformas garcia sl", "denia"));
    expect(prospectCompanyKey("Estudio X, S.L.U.", "Jávea")).toBe(prospectCompanyKey("ESTUDIO X SLU", "javea"));
  });

  it("houdt dezelfde naam in een andere plaats gescheiden", () => {
    expect(prospectCompanyKey("Reformas García", "Dénia")).not.toBe(prospectCompanyKey("Reformas García", "Alicante"));
  });
});
