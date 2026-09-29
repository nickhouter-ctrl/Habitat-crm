/**
 * De opvolgmail met de films.
 *
 * Twee dingen gingen mis bij de bevestigingsmails van de eerste beursdag: de
 * films zaten er niet bij, en iedereen kreeg Engels omdat de QR-code naar de
 * Engelse pagina wees. Deze mail gaat naar dezelfde mensen en repareert beide:
 * hij is tweetalig, zodat niemand hoeft te weten wie welke taal nodig had.
 */
import { describe, expect, it } from "vitest";

import { BEURS } from "@/lib/beurs";
import { FILMPAGINA, beursVervolgmail } from "@/lib/beurs-vervolgmail";

describe("opvolgmail", () => {
  it("staat in het Engels én het Spaans, in die volgorde", () => {
    const m = beursVervolgmail("Marta Cenal");
    expect(m.blokken.map((b) => b.taal)).toEqual(["en", "es"]);
    expect(m.subject).toContain("films");
    expect(m.subject).toContain("vídeos");
  });

  it("spreekt de bezoeker met zijn voornaam aan, in beide talen", () => {
    const m = beursVervolgmail("Marta Cenal Rodriquez de La Rua");
    for (const b of m.blokken) {
      expect(b.hallo("")).toContain("Marta");
      expect(b.hallo("")).not.toContain("Rodriquez");
    }
  });

  it("linkt naar de filmpagina in de taal van het blok", () => {
    const [en, es] = beursVervolgmail("Ana").blokken;
    expect(en.link).toBe(FILMPAGINA.en);
    expect(es.link).toBe(FILMPAGINA.es);
    expect(es.link).toContain("/es/");
  });

  it("noemt de stand, zodat de bezoeker weet waar hij ons van kent", () => {
    const m = beursVervolgmail("Ana");
    expect(m.blokken[0].alineas.join(" ")).toContain(BEURS.stand);
    expect(m.blokken[1].alineas.join(" ")).toContain(BEURS.naam);
  });

  it("vertelt dat de films geen geluid hebben — anders denkt iemand dat het stuk is", () => {
    const m = beursVervolgmail("Ana");
    expect(m.blokken[0].alineas.join(" ").toLowerCase()).toContain("no sound");
    expect(m.blokken[1].alineas.join(" ").toLowerCase()).toContain("no tienen sonido");
  });
});
