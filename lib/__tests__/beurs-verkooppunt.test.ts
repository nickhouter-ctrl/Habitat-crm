import { describe, expect, it } from "vitest";
import { beursMail } from "@/lib/beurs";
import { BEURS_VERKOOPPUNT } from "@/lib/beurs-prijsuitleg";
import { vervolgmailHtml, vervolgmailTekst } from "@/lib/beurs-vervolgmail";

describe("verkooppuntuitnodiging alleen bij expliciete interesse", () => {
  for (const taal of ["nl", "en", "es"] as const) {
    it(`${taal}: alleen de keuze 'wil ons verkopen' ontvangt de uitnodiging`, () => {
      for (const rol of [undefined, "architect", "ontwerper", "aannemer", "particulier", "anders"]) {
        expect(beursMail({ naam: "Ana", taal, rol }).alineas).not.toContain(BEURS_VERKOOPPUNT[taal]);
      }
      expect(beursMail({ naam: "Ana", taal, rol: "wederverkoper" }).alineas).toContain(BEURS_VERKOOPPUNT[taal]);
    });
  }
  it("past dezelfde selectie toe op HTML en tekst van de tweetalige opvolgmail", () => {
    for (const copy of [BEURS_VERKOOPPUNT.en, BEURS_VERKOOPPUNT.es]) {
      expect(vervolgmailTekst("Ana")).not.toContain(copy);
      expect(vervolgmailTekst("Ana", true)).toContain(copy);
    }
    expect(vervolgmailHtml("Ana")).not.toContain("retail partner");
    expect(vervolgmailHtml("Ana", "", true)).toContain("retail partner");
    expect(vervolgmailHtml("Ana", "", true)).toContain("punto de venta");
  });
});
