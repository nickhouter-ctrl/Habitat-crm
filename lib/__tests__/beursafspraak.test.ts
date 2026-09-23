/**
 * Een afspraak op de beursstand is geen showroombezoek.
 *
 * Carlos Bonet vroeg een afspraak op 360 by Cevisama aan en kreeg een mail over
 * "our showroom in Jávea" — 100 km de verkeerde kant op. De bron van de
 * aanvraag (`website:feria-…`) is het enige veld waar dit betrouwbaar in staat;
 * deze test houdt vast dat élke tekst die de klant ziet daarop meebeweegt.
 */
import { describe, expect, it } from "vitest";

import { BEURSSTAND, SHOWROOM, isBeursAanvraag, standaardLocatie } from "@/lib/appointments";
import { appointmentConfirmedEmail, appointmentProposalEmail, appointmentReceivedEmail } from "@/lib/email";

describe("beursaanvraag herkennen", () => {
  it("kijkt naar de bron van de website", () => {
    expect(isBeursAanvraag("website:feria-360-cevisama-2026")).toBe(true);
    expect(isBeursAanvraag("WEBSITE:FERIA-360")).toBe(true);
    expect(isBeursAanvraag("website:appointment:architect")).toBe(false);
    expect(isBeursAanvraag("website:contact:showroom")).toBe(false);
    expect(isBeursAanvraag(null)).toBe(false);
    expect(isBeursAanvraag(undefined)).toBe(false);
  });

  it("kiest de stand of de showroom als standaardlocatie", () => {
    expect(standaardLocatie("website:feria-360-cevisama-2026")).toBe(BEURSSTAND);
    expect(standaardLocatie("website:particulier")).toBe(SHOWROOM);
    expect(BEURSSTAND).toContain("stand C109");
    expect(SHOWROOM).toContain("Jávea");
  });
});

describe("voorstelmail met meerdere tijden", () => {
  const url = "https://crm.habitat-one.com/book/abc";

  it("noemt de beursstand en niet de showroom", () => {
    for (const lang of ["nl", "en", "es", "de"]) {
      const m = appointmentProposalEmail({ lang, contactName: "Carlos", url, fair: true });
      expect(m.text).toMatch(/Cevisama/);
      expect(m.text).toMatch(/C109/);
      expect(m.text.toLowerCase()).not.toContain("showroom");
      expect(m.subject.toLowerCase()).not.toContain("showroom");
      expect(m.html).toContain(url);
      expect(m.text).toContain(url);
      expect(m.html).toContain("Carlos");
    }
  });

  it("houdt de showroomtekst voor een gewone aanvraag", () => {
    const m = appointmentProposalEmail({ lang: "en", contactName: "Carlos", url });
    expect(m.text.toLowerCase()).toContain("showroom");
    expect(m.text).not.toMatch(/Cevisama/);
  });
});

describe("bevestigingsmail", () => {
  const basis = { lang: "en", contactName: "Carlos", when: "Tuesday 29 September, 10:00" };

  it("verwelkomt op de stand bij een beursafspraak", () => {
    const m = appointmentConfirmedEmail({ ...basis, location: BEURSSTAND, fair: true });
    expect(m.html).toContain("Cevisama");
    expect(m.html).toContain("C109");
    expect(m.html.toLowerCase()).not.toContain("our showroom");
    expect(m.text).toContain(BEURSSTAND);
  });

  it("verwelkomt in de showroom bij een gewone afspraak", () => {
    const m = appointmentConfirmedEmail({ ...basis, location: SHOWROOM });
    expect(m.html.toLowerCase()).toContain("showroom");
    expect(m.html).not.toContain("Cevisama");
  });
});

describe("ontvangstbevestiging (bestond al)", () => {
  it("blijft de standtekst gebruiken bij de beurs", () => {
    const m = appointmentReceivedEmail({ lang: "es", contactName: "Carlos", when: "29/09", fair: true });
    expect(m.html).toContain("Cevisama");
    const gewoon = appointmentReceivedEmail({ lang: "es", contactName: "Carlos", when: "29/09" });
    expect(gewoon.html).not.toContain("Cevisama");
  });
});
