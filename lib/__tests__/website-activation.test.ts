/**
 * De activatiemail voor een website-account.
 *
 * Wie in het Spaans een account aanvraagt, moet ook in het Spaans horen dat
 * het account klaarstaat — en op de Spaanse activatiepagina landen. Zonder
 * bekende taal kiezen we Engels, net als de website zelf.
 */
import { describe, expect, it } from "vitest";

import { mailLanguage, websiteActivationLink, websiteActivationMail } from "@/lib/portal/website-activation";

const base = "https://www.habitat-one.com";

describe("websiteActivationMail", () => {
  it("volgt de taal van de aanvraag", () => {
    const es = websiteActivationMail({ name: "Ana", token: "t1", tier: "particulier", locale: "es", baseUrl: base });
    expect(es.subject).toContain("contraseña");
    expect(es.html).toContain("Hola Ana,");
    expect(es.html).toContain("/es/account/activeren?token=t1");

    const nl = websiteActivationMail({ name: "Kees", token: "t2", tier: "aannemer", locale: "nl", baseUrl: base });
    expect(nl.subject).toContain("wachtwoord");
    expect(nl.html).toContain("zakelijk account");
    expect(nl.text).toContain("/nl/account/activeren?token=t2");
  });

  it("valt terug op Engels zonder bekende taal, met de link zonder taalvoorvoegsel", () => {
    const mail = websiteActivationMail({ name: "", token: "t3", tier: "particulier", locale: null, baseUrl: base });
    expect(mail.subject).toContain("password");
    expect(mail.html).toContain("Dear customer,");
    expect(mail.html).toContain(`${base}/account/activeren?token=t3`);
    expect(mailLanguage("fr", undefined, "de")).toBe("de");
    expect(websiteActivationLink(base, "a b", "en")).toBe(`${base}/account/activeren?token=a%20b`);
  });

  it("ontsnapt de naam in de html", () => {
    const mail = websiteActivationMail({ name: "<b>x</b>", token: "t", tier: "particulier", locale: "de", baseUrl: base });
    expect(mail.html).toContain("Hallo &lt;b&gt;x&lt;/b&gt;,");
  });
});
