/**
 * Wat de bezoeker aanvinkt, en wat voor account hij daarna krijgt.
 *
 * Bijna iedereen op de stand wil hetzelfde: stalen, prijzen, beeldmateriaal.
 * Dat stond tot nu toe ergens in de vrije tekst en was bij het opvolgen niet te
 * filteren. En het account: de goedkeuring is al gebeurd in het gesprek aan de
 * stand, dus de knop "stel je wachtwoord in" mag meteen in de bevestigingsmail
 * — maar zakelijke prijzen niet zomaar voor wie de QR-code scant en zelf
 * "architect" aanvinkt.
 */
import { describe, expect, it } from "vitest";

import { bepaalTier, beursMail, contactNotitie, interesseLabel, schoonInteresses } from "@/lib/beurs";

describe("wat de bezoeker vroeg", () => {
  it("houdt alleen bekende vinkjes over, in een vaste volgorde", () => {
    expect(schoonInteresses(["prijzen", "stalen", "iets-verzonnens"])).toEqual(["stalen", "prijzen"]);
    expect(schoonInteresses(null)).toEqual([]);
  });

  it("zet ze op de notitie van het contact", () => {
    const n = contactNotitie({ rol: "architect", interesses: ["stalen", "prijzen"] });
    expect(n).toContain(`Wil: ${interesseLabel("stalen")}, ${interesseLabel("prijzen")}`);
  });

  it("noemt ze terug in de bevestigingsmail, in zijn eigen taal", () => {
    const m = beursMail({ naam: "Ana", taal: "es", interesses: ["stalen"] });
    expect(m.alineas.join(" ")).toContain("muestras");
  });

  it("zwijgt erover als er niets is aangevinkt", () => {
    const m = beursMail({ naam: "Ana", taal: "nl" });
    expect(m.alineas.join(" ")).not.toContain("Je vroeg om");
  });
});

describe("account in de bevestigingsmail", () => {
  it("zet de knop erbij zodra er een link is", () => {
    const m = beursMail({ naam: "Ana", taal: "nl", accountLink: "https://www.habitat-one.com/nl/account/activeren?token=x" });
    expect(m.account?.link).toContain("token=x");
    expect(m.account?.knop).toBe("Wachtwoord instellen");
  });

  it("laat het blok weg zonder link — een bestaand account krijgt er geen tweede", () => {
    expect(beursMail({ naam: "Ana", taal: "nl" }).account).toBeNull();
  });
});

describe("welk tarief", () => {
  it("geeft wie wij zelf invoeren het zakelijke tarief", () => {
    expect(bepaalTier({ rol: "architect", zelfIngevuld: false })).toBe("aannemer");
    expect(bepaalTier({ rol: "wederverkoper", zelfIngevuld: false })).toBe("aannemer");
  });

  it("houdt een particulier particulier, ook als wij hem invoeren", () => {
    expect(bepaalTier({ rol: "particulier", zelfIngevuld: false })).toBe("particulier");
    expect(bepaalTier({ rol: "anders", bedrijf: "Iets BV", zelfIngevuld: false })).toBe("particulier");
  });

  it("vraagt bij de QR-code om een bedrijfsnaam — iedereen kan 'architect' aanvinken", () => {
    expect(bepaalTier({ rol: "architect", zelfIngevuld: true })).toBe("particulier");
    expect(bepaalTier({ rol: "architect", bedrijf: "Estudio Bonet", zelfIngevuld: true })).toBe("aannemer");
  });
});
