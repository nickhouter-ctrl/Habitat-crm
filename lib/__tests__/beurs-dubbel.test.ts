/**
 * Twee keer op opslaan drukken.
 *
 * Dat gebeurde echt, twee keer zelfs: eerst met een testinvoer, later met een
 * échte bezoeker — twee regels, 331 milliseconden na elkaar. Op een stand tik
 * je snel, en een trage verbinding nodigt uit tot nog een tik. Er mag dan niets
 * dubbel worden opgeslagen en, belangrijker, geen tweede mail naar de bezoeker.
 *
 * Twee gevallen, twee sloten:
 *  1. de tweede tik komt ná de eerste (een halve minuut later) — dan ziet de
 *     controle vooraf dat we dit adres net hebben vastgelegd;
 *  2. de twee tikken lopen door elkaar heen — dan ziet die controle nog niets,
 *     want de ander heeft nog niet opgeslagen. Daarom gaat de aanvraag als
 *     eerste naar binnen met een sleutel waar een unieke index op staat: de
 *     verliezer stopt vóór er een contact, een account of een mail is.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  zoekAanvraag: vi.fn(),
  insertAanvraag: vi.fn(),
  mail: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      quoteRequests: { findFirst: mocks.zoekAanvraag },
      companies: { findFirst: vi.fn().mockResolvedValue(null) },
      contacts: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: mocks.insertAanvraag }),
        returning: vi.fn().mockResolvedValue([{ id: "contact-nieuw" }]),
      }),
    }),
    update: () => ({ set: (values: unknown) => { mocks.set(values); return { where: mocks.update }; } }),
  },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.mail,
  brandedEmail: (s: string) => s,
  escapeHtml: (s: string) => s,
  signatureHtml: () => "",
}));
vi.mock("@/lib/geocode-plaats", () => ({ zoekCoordinaten: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/beurs-account", () => ({
  zetBeursAccountKlaar: vi.fn().mockResolvedValue({ activatieLink: null, tier: "particulier" }),
}));

import { slaBeursbezoekerOp } from "@/lib/beurs-opslag";

const bezoeker = {
  naam: "Marta Cenal",
  email: "Marta@Martacenal.es",
  rol: "architect",
  taal: "es" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertAanvraag.mockResolvedValue([{ id: "nieuw-id" }]);
  mocks.mail.mockResolvedValue({ sent: true });
  mocks.update.mockResolvedValue(undefined);
});

describe("dezelfde bezoeker twee keer opslaan", () => {
  it("herkent een tweede tik van even later en mailt niet opnieuw", async () => {
    mocks.zoekAanvraag.mockResolvedValue({ id: "eerste-id", contactId: "contact-1" });

    const res = await slaBeursbezoekerOp(bezoeker);

    expect(res.dubbel).toBe(true);
    expect(res.aanvraagId).toBe("eerste-id");
    expect(mocks.mail).not.toHaveBeenCalled();
    expect(mocks.insertAanvraag).not.toHaveBeenCalled();
  });

  it("hoofdletters in het adres helpen er niet omheen", async () => {
    mocks.zoekAanvraag.mockResolvedValue({ id: "eerste-id", contactId: "contact-1" });
    const res = await slaBeursbezoekerOp({ ...bezoeker, email: "MARTA@martacenal.ES" });
    expect(res.dubbel).toBe(true);
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("stopt ook als de twee tikken door elkaar heen lopen", async () => {
    // Niets gevonden vooraf — de ander had nog niet opgeslagen. De unieke index
    // laat de tweede rij niet toe, dus komt er niets terug uit de insert.
    mocks.zoekAanvraag.mockResolvedValueOnce(undefined);
    mocks.insertAanvraag.mockResolvedValue([]);
    mocks.zoekAanvraag.mockResolvedValueOnce({ id: "winnaar-id", contactId: "contact-1" });

    const res = await slaBeursbezoekerOp(bezoeker);

    expect(res.dubbel).toBe(true);
    expect(res.aanvraagId).toBe("winnaar-id");
    // En het belangrijkste: geen tweede bevestigingsmail.
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("legt een nieuwe bezoeker gewoon vast en mailt één keer", async () => {
    mocks.zoekAanvraag.mockResolvedValue(undefined);

    const res = await slaBeursbezoekerOp(bezoeker);

    expect(res.dubbel).toBe(false);
    expect(mocks.mail).toHaveBeenCalledTimes(1);
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ copyPolicy: "nick-frederique" }));
    expect(mocks.set.mock.calls.some(([value]) => value.tags)).toBe(true);
  });

  it("registreert geen filmmail als de verzending mislukt", async () => {
    mocks.zoekAanvraag.mockResolvedValue(undefined);
    mocks.mail.mockResolvedValue({ sent: false });

    const res = await slaBeursbezoekerOp(bezoeker);

    expect(res.mail).toBe("mislukt");
    expect(mocks.set.mock.calls.some(([value]) => value.tags)).toBe(false);
  });

  it("meldt een verstuurde mail niet als mislukt als de registratie faalt", async () => {
    mocks.zoekAanvraag.mockResolvedValue(undefined);
    mocks.update.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("database unavailable"));

    const res = await slaBeursbezoekerOp(bezoeker);

    expect(res.mail).toBe("verstuurd");
    expect(mocks.mail).toHaveBeenCalledTimes(1);
  });
});
