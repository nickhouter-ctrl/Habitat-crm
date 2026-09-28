/**
 * Het publieke endpoint achter de QR-code op de stand.
 *
 * Dit is het enige stuk van het CRM dat van buiten bereikbaar is zonder in te
 * loggen, dus hier wordt gecontroleerd wat er níét doorheen komt: rommel, een
 * onbekende rol, een bot, en iemand die hetzelfde adres blijft insturen. En wat
 * er wel doorheen komt mag niets over het CRM prijsgeven.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ opslaan: vi.fn(), limiet: vi.fn() }));
vi.mock("@/lib/beurs-opslag", () => ({ slaBeursbezoekerOp: mocks.opslaan }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limiet, clientIp: () => "1.2.3.4" }));

import { POST } from "@/app/api/beurs/route";

const goed = {
  naam: "Carlos Bonet",
  email: "Carlos@Estudio.es",
  telefoon: "+34 600 123 456",
  bedrijf: "Estudio Bonet",
  rol: "architect",
  taal: "es",
  wens: "Zoekt Flexible Stone voor een villa in Moraira",
};

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/beurs", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://www.habitat-one.com" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limiet.mockResolvedValue(true);
  mocks.opslaan.mockResolvedValue({ contactId: "c1", aanvraagId: "a1", mail: "verstuurd" });
});

describe("beursformulier op de website", () => {
  it("legt een bezoeker vast als 'zelf ingevuld'", async () => {
    const r = await post(goed);
    expect(r.status).toBe(201);
    expect(mocks.opslaan).toHaveBeenCalledWith(expect.objectContaining({ rol: "architect", zelfIngevuld: true }));
  });

  it("geeft geen enkel id terug — de bezoeker hoeft niets van het CRM te weten", async () => {
    const body = await (await post(goed)).json();
    expect(JSON.stringify(body)).not.toContain("c1");
    expect(JSON.stringify(body)).not.toContain("a1");
  });

  it("weigert een onbekende rol en een leeg formulier", async () => {
    expect((await post({ ...goed, rol: "spion" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(mocks.opslaan).not.toHaveBeenCalled();
  });

  it("slaat niets op als het verborgen veld is ingevuld, maar laat de bot niets merken", async () => {
    const r = await post({ ...goed, website: "https://spam.example" });
    expect(r.status).toBe(201);
    expect(mocks.opslaan).not.toHaveBeenCalled();
  });

  it("remt op e-mailadres, zodat niemand andermans postvak kan laten vollopen", async () => {
    mocks.limiet.mockResolvedValueOnce(false);
    expect((await post(goed)).status).toBe(429);
    expect(mocks.limiet).toHaveBeenCalledWith("beurs:mail:carlos@estudio.es", 3, 3600);
    expect(mocks.opslaan).not.toHaveBeenCalled();
  });

  it("houdt de IP-teller ruim — een hele beurshal deelt één wifi-adres", async () => {
    await post(goed);
    const ipTeller = mocks.limiet.mock.calls.find((c) => String(c[0]).startsWith("beurs:ip:"));
    expect(ipTeller?.[1]).toBeGreaterThanOrEqual(100);
  });

  it("zegt het eerlijk als het opslaan mislukt, zodat het formulier het later opnieuw probeert", async () => {
    mocks.opslaan.mockRejectedValue(new Error("database weg"));
    expect((await post(goed)).status).toBe(500);
  });
});
