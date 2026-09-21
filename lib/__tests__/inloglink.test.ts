/**
 * "Stuur mij een inloglink" — wat deze knop NIET mag doen.
 *
 * De drie eisen waar het hier om gaat: het scherm zegt altijd hetzelfde (anders
 * lees je eruit af wie hier een account heeft), er gaat nooit een persoonlijke
 * inloglink in het gedeelde postvak via de bedrijfs-BCC, en de rem houdt iemand
 * tegen die andermans mailbox wil volgooien.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  gebruiker: vi.fn(),
  token: vi.fn(),
  mail: vi.fn(),
  rem: vi.fn(),
  headers: vi.fn(),
}));

class Omleiding extends Error {
  constructor(public naar: string) {
    super(`REDIRECT:${naar}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (naar: string) => {
    throw new Omleiding(naar);
  },
}));
vi.mock("next/headers", () => ({ headers: m.headers }));
vi.mock("@/lib/db", () => ({ db: { query: { users: { findFirst: m.gebruiker } } } }));
vi.mock("@/lib/login-links", () => ({ maakZelfAangevraagdeLink: m.token, ZELF_GELDIG_MINUTEN: 30 }));
vi.mock("@/lib/email", () => ({
  sendEmail: m.mail,
  brandedEmail: (inner: string) => inner,
  escapeHtml: (s: string) => s,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimitDetail: m.rem,
  clientIpFromHeaders: () => "1.2.3.4",
}));

import { vraagInloglink } from "../../app/login/actions";

/** De actie eindigt altijd op een omleiding; geef die terug. */
async function vraag(email: string | null): Promise<string> {
  const fd = new FormData();
  if (email !== null) fd.set("email", email);
  try {
    await vraagInloglink(fd);
  } catch (err) {
    if (err instanceof Omleiding) return err.naar;
    throw err;
  }
  throw new Error("verwachtte een omleiding");
}

beforeEach(() => {
  vi.clearAllMocks();
  m.headers.mockResolvedValue(new Headers());
  m.rem.mockResolvedValue({ ok: true, wachtSec: 0 });
  m.token.mockResolvedValue("token-abc");
  m.mail.mockResolvedValue({ sent: true });
  m.gebruiker.mockResolvedValue({
    id: "u1",
    name: "Elles",
    email: "hi@habitat-one.com",
    locale: "nl",
  });
});

describe("inloglink aanvragen op het inlogscherm", () => {
  it("mailt een verse eenmalige link naar het adres zelf, zonder bedrijfskopie", async () => {
    expect(await vraag("HI@habitat-one.com")).toBe("/login?link=verstuurd");
    expect(m.token).toHaveBeenCalledWith("u1");
    const mail = m.mail.mock.calls[0][0];
    expect(mail.to).toBe("hi@habitat-one.com");
    expect(mail.noCompanyBcc).toBe(true);
    expect(mail.html).toContain("/login/link/token-abc");
    expect(mail.text).toContain("/login/link/token-abc");
    // Geen extra BCC erbij verzinnen: dit is de enige ontvanger.
    expect(mail.bcc).toBeUndefined();
  });

  it("normaliseert het adres: hoofdletters en spaties doen niets", async () => {
    // Zelfde variabele voedt de rem én de zoekopdracht, dus de remsleutel is
    // het bewijs dat er met het genormaliseerde adres gewerkt wordt. (De query
    // zelf vergelijkt op `lower(email)`, zodat een rij mét hoofdletters ook
    // gevonden wordt.)
    await vraag("  HI@Habitat-One.com ");
    expect(m.rem.mock.calls[1][0]).toBe("inloglink:email:hi@habitat-one.com");
  });

  it("zegt precies hetzelfde bij een onbekend adres en mailt niets", async () => {
    m.gebruiker.mockResolvedValue(undefined);
    expect(await vraag("onbekend@example.com")).toBe("/login?link=verstuurd");
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.token).not.toHaveBeenCalled();
  });

  it("stuurt niets meer zodra de rem eroverheen gaat, met dezelfde melding", async () => {
    m.rem.mockResolvedValueOnce({ ok: true, wachtSec: 0 });
    m.rem.mockResolvedValueOnce({ ok: false, wachtSec: 600 });
    expect(await vraag("hi@habitat-one.com")).toBe("/login?link=verstuurd");
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.gebruiker).not.toHaveBeenCalled();
  });

  it("remt per IP én per adres, en faalt dicht", async () => {
    await vraag("hi@habitat-one.com");
    const keys = m.rem.mock.calls.map((c) => c[0]);
    expect(keys).toEqual(["inloglink:ip:1.2.3.4", "inloglink:email:hi@habitat-one.com"]);
    for (const c of m.rem.mock.calls) expect(c[3]).toEqual({ strikt: true });
  });

  it("vraagt om het adres als het veld leeg is, zonder de rem te belasten", async () => {
    expect(await vraag("")).toBe("/login?link=leeg");
    expect(await vraag(null)).toBe("/login?link=leeg");
    expect(await vraag("geen adres")).toBe("/login?link=leeg");
    expect(m.rem).not.toHaveBeenCalled();
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("schrijft de mail in de taal van de ontvanger", async () => {
    m.gebruiker.mockResolvedValue({ id: "u2", name: "Teresa", email: "teresa@habitat-one.com", locale: "es" });
    await vraag("teresa@habitat-one.com");
    const mail = m.mail.mock.calls[0][0];
    expect(mail.subject).toBe("Tu enlace de acceso al CRM");
    expect(mail.html).toContain("Hola Teresa:");
    expect(mail.html).toContain("30 minutos");
  });

  it("valt terug op Nederlands bij een onbekende taalinstelling", async () => {
    m.gebruiker.mockResolvedValue({ id: "u3", name: null, email: "hans@habitat-one.com", locale: "pt" });
    await vraag("hans@habitat-one.com");
    const mail = m.mail.mock.calls[0][0];
    expect(mail.subject).toBe("Je inloglink voor het CRM");
    expect(mail.html).toContain("Hallo,");
  });
});
