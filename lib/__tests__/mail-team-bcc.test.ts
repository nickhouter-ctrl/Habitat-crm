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

import { ALWAYS_BCC, TEAM_BCC, withMandatoryBcc } from "@/lib/mail-bcc";

const adressen = (v: string | undefined) => (v ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);

describe("klantmail", () => {
  it("gaat in kopie naar kantoor én naar de bredere kring", () => {
    const bcc = adressen(withMandatoryBcc(undefined, "klant@voorbeeld.es"));
    for (const adres of [...ALWAYS_BCC, ...TEAM_BCC]) expect(bcc).toContain(adres.toLowerCase());
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

  it("houdt wel de vaste bedrijfskopie", () => {
    const bcc = adressen(withMandatoryBcc(undefined, "iemand@habitat-one.com", true));
    expect(bcc.length).toBeGreaterThan(0);
    for (const adres of ALWAYS_BCC) {
      if (adres.toLowerCase() !== "iemand@habitat-one.com") expect(bcc).toContain(adres.toLowerCase());
    }
  });
});
