/**
 * Wie leest er mee met de uitgaande mail?
 *
 * Nick en Frederique stonden al op elke mail; Mourad en Teresa zijn erbij
 * gekomen zodat zij klantcontact zien en kunnen antwoorden. Twee mails blijven
 * bewust bij kantoor: de dagelijkse data-check en de weekcontrole — dat zijn
 * interne controles, geen klantcontact. Facturen keuren viel er al buiten,
 * want die mail draagt een persoonlijke inloglink.
 */
import { describe, expect, it } from "vitest";

import { ALWAYS_BCC, TEAM_BCC, TEAM_CC, copyPolicyCc, withMandatoryBcc } from "@/lib/mail-bcc";

const adressen = (v: string | undefined) => (v ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);

describe("klantmail", () => {
  it("geeft algemene documentmail alleen een vaste kantoorkopie", () => {
    const bcc = adressen(withMandatoryBcc(undefined, "klant@voorbeeld.es"));
    for (const adres of ALWAYS_BCC) expect(bcc).toContain(adres.toLowerCase());
    for (const adres of TEAM_BCC) expect(bcc).not.toContain(adres.toLowerCase());
  });

  it("heeft Mourad en Teresa in die kring", () => {
    expect(TEAM_BCC.join(" ")).toContain("mourad");
    expect(TEAM_BCC.join(" ")).toContain("teresa");
  });

  it("zet de ontvanger zelf nooit in de kopie", () => {
    const bcc = adressen(withMandatoryBcc(undefined, TEAM_BCC[0]));
    expect(bcc).not.toContain(TEAM_BCC[0].toLowerCase());
  });

  it("dubbelt niet als een adres al in de kopie stond", () => {
    const bcc = adressen(withMandatoryBcc(TEAM_BCC[0], "klant@voorbeeld.es"));
    expect(bcc.filter((a) => a === TEAM_BCC[0].toLowerCase())).toHaveLength(1);
  });
});

describe("interne controlemail", () => {
  it("blijft bij kantoor", () => {
    const bcc = adressen(withMandatoryBcc(undefined, "hi@habitat-one.com", true));
    for (const adres of TEAM_BCC) expect(bcc).not.toContain(adres.toLowerCase());
  });

  it("houdt persoonlijke kantoorkopieën, zonder hi", () => {
    const bcc = adressen(withMandatoryBcc(undefined, "iemand@habitat-one.com", true));
    expect(bcc.length).toBeGreaterThan(0);
    for (const adres of ALWAYS_BCC) {
      if (adres.toLowerCase() !== "iemand@habitat-one.com" && adres.toLowerCase() !== "hi@habitat-one.com") expect(bcc).toContain(adres.toLowerCase());
    }
  });
});

describe("zichtbare kopie bij klantmail", () => {
  it("zet het hele opvolgteam plus de afzender in de CC", () => {
    const cc = adressen(copyPolicyCc("team", "klant@voorbeeld.es", "hans@habitat-one.com"));
    for (const adres of TEAM_CC) expect(cc).toContain(adres.toLowerCase());
    expect(cc).toContain("hans@habitat-one.com");
  });

  it("dubbelt de afzender niet als hij al in het team zit", () => {
    const cc = adressen(copyPolicyCc("team", "klant@voorbeeld.es", TEAM_CC[0]));
    expect(cc.filter((a) => a === TEAM_CC[0].toLowerCase())).toHaveLength(1);
  });

  it("zet de klant zelf nooit in de kopie", () => {
    const cc = adressen(copyPolicyCc("team", `Nick <${TEAM_CC[0]}>`, null));
    expect(cc).not.toContain(TEAM_CC[0].toLowerCase());
  });

  it("houdt de oude beursafspraak bij die twee", () => {
    const cc = adressen(copyPolicyCc("nick-frederique", "klant@voorbeeld.es", "teresa@habitat-one.com"));
    expect(cc).toHaveLength(2);
    expect(cc).not.toContain("teresa@habitat-one.com");
  });
});
