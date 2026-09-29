/**
 * Twee keer op opslaan drukken.
 *
 * Dat gebeurde echt: bij het testen stonden er twee identieke invoeren, één
 * seconde uit elkaar. Op een stand tik je nu eenmaal snel, en een trage
 * verbinding nodigt uit tot nog een tik. Er mag dan niets dubbel worden
 * opgeslagen en — belangrijker — geen tweede mail naar de bezoeker gaan.
 *
 * De knop in het scherm is de eerste rem, maar die telt hier niet mee: een
 * tweede tik kan als een apart verzoek binnenkomen, en een invoer uit de
 * wachtrij kan opnieuw langskomen als het antwoord onderweg verdween. Dus
 * bewaakt deze test de rem op de server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bestaandeAanvraag: vi.fn(),
  insertQuote: vi.fn(),
  mail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      quoteRequests: { findFirst: mocks.bestaandeAanvraag },
      companies: { findFirst: vi.fn().mockResolvedValue(null) },
      contacts: { findFirst: vi.fn().mockResolvedValue(null) },
      customerAccounts: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    insert: () => ({
      values: () => ({ returning: mocks.insertQuote }),
    }),
    update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) }),
  },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.mail,
  brandedEmail: (s: string) => s,
  escapeHtml: (s: string) => s,
  signatureHtml: () => "",
}));
vi.mock("@/lib/geocode-plaats", () => ({ zoekCoordinaten: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/beurs-account", () => ({ zetBeursAccountKlaar: vi.fn().mockResolvedValue({ activatieLink: null, tier: "particulier" }) }));
// `server-only` bestaat alleen binnen Next; in een test is het een lege module.
vi.mock("server-only", () => ({}));

import { slaBeursbezoekerOp } from "@/lib/beurs-opslag";

const bezoeker = {
  naam: "Carlos Bonet",
  email: "Carlos@Estudio.es",
  rol: "architect",
  taal: "es" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertQuote.mockResolvedValue([{ id: "nieuw-id" }]);
  mocks.mail.mockResolvedValue({ sent: true });
});

describe("twee keer opslaan", () => {
  it("legt niets nieuws vast en mailt niet nog een keer", async () => {
    // Deze bezoeker is een tel geleden al vastgelegd.
    mocks.bestaandeAanvraag.mockResolvedValue({ id: "eerste-id", contactId: "contact-1" });

    const res = await slaBeursbezoekerOp(bezoeker);

    expect(res.dubbel).toBe(true);
    expect(res.aanvraagId).toBe("eerste-id");
    expect(res.contactId).toBe("contact-1");
    expect(mocks.mail).not.toHaveBeenCalled();
    expect(mocks.insertQuote).not.toHaveBeenCalled();
  });

  it("legt hem gewoon vast als hij nog niet bekend is", async () => {
    mocks.bestaandeAanvraag.mockResolvedValue(undefined);

    const res = await slaBeursbezoekerOp(bezoeker);

    expect(res.dubbel).toBe(false);
    expect(mocks.mail).toHaveBeenCalledTimes(1);
  });

  it("kijkt ook bij een tweede tik met hoofdletters in het adres", async () => {
    // "Carlos@Estudio.es" en "carlos@estudio.es" zijn dezelfde bezoeker; de
    // vergelijking gebeurt in kleine letters, dus de tweede tik valt hier weg.
    mocks.bestaandeAanvraag.mockResolvedValue({ id: "eerste-id", contactId: "contact-1" });
    const res = await slaBeursbezoekerOp({ ...bezoeker, email: "CARLOS@estudio.ES" });
    expect(res.dubbel).toBe(true);
    expect(mocks.mail).not.toHaveBeenCalled();
  });
});
