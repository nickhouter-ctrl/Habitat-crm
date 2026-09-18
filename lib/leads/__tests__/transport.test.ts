import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALWAYS_BCC } from "@/lib/mail-bcc";

const oudeKey = process.env.RESEND_API_KEY;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.CAMPAIGN_FROM = "Teresa · Habitat One <teresa@habitat-one.com>";
  process.env.CAMPAIGN_REPLY_TO = "teresa@habitat-one.com";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CAMPAIGN_ALLOWED_DOMAINS;
  if (oudeKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = oudeKey;
});

async function verstuurMetNep(antwoord: { ok?: boolean; status?: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: antwoord.ok ?? true,
      status: antwoord.status ?? 200,
      json: async () => antwoord.body ?? { id: "resend-123" },
      text: async () => JSON.stringify(antwoord.body ?? {}),
    } as Response);
  });
  const { sendBulkMail } = await import("@/lib/leads/transport");
  const res = await sendBulkMail({
    to: "info@empresa.es",
    subject: "Novedades",
    html: "<p>hola</p>",
    text: "hola",
    recipientId: "rij-1",
    headers: {
      "List-Unsubscribe": "<https://habitat-one.com/api/leads/unsubscribe?token=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return { res, payload: calls[0] ? JSON.parse(String(calls[0].init.body)) : null, calls };
}

describe("campagneverzending", () => {
  it("zet NOOIT een interne kopie op de mail", async () => {
    // 7.000 adressen × 3 interne bcc's = 21.000 kopieën naar hi@, en de
    // mail-poll zou ze daarna weer proberen in te lezen.
    const { payload } = await verstuurMetNep({});
    expect(payload).not.toHaveProperty("bcc");
    expect(payload).not.toHaveProperty("cc");
    const alles = JSON.stringify(payload).toLowerCase();
    for (const intern of ALWAYS_BCC) {
      expect(alles).not.toContain(intern.toLowerCase());
    }
  });

  it("stuurt vanaf Teresa met haar adres als reply-to", async () => {
    const { payload } = await verstuurMetNep({});
    expect(payload.from).toContain("teresa@habitat-one.com");
    expect(payload.reply_to).toBe("teresa@habitat-one.com");
  });

  it("zet de afmeldheaders en ons eigen kenmerk erop", async () => {
    const { payload } = await verstuurMetNep({});
    expect(payload.headers["List-Unsubscribe"]).toContain("unsubscribe");
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(payload.headers["X-Habitat-Recipient"]).toBe("rij-1");
  });

  it("geeft het provider-id terug bij succes", async () => {
    const { res } = await verstuurMetNep({ body: { id: "abc-789" } });
    expect(res).toEqual({ ok: true, providerId: "abc-789" });
  });

  it("wil het opnieuw proberen bij 429 en bij een storing", async () => {
    for (const status of [429, 500, 503]) {
      const { res } = await verstuurMetNep({ ok: false, status });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.opnieuw).toBe(true);
    }
  });

  it("geeft het op bij een fout over de mail zelf", async () => {
    const { res } = await verstuurMetNep({ ok: false, status: 422, body: { message: "Invalid `to` field" } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.opnieuw).toBe(false);
      expect(res.fout).toContain("422");
    }
  });

  it("probeert het opnieuw als het netwerk wegvalt", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNRESET")));
    const { sendBulkMail } = await import("@/lib/leads/transport");
    const res = await sendBulkMail({ to: "a@b.es", subject: "s", html: "h", text: "t" });
    expect(res).toEqual({ ok: false, opnieuw: true, fout: "ECONNRESET" });
  });

  it("blokkeert een adres buiten de toegestane domeinen", async () => {
    // Het slot dat voorkomt wat er bij de eerste proef gebeurde: een script
    // koos "architecten" als doelgroep en raakte twee echte bureaus.
    process.env.CAMPAIGN_ALLOWED_DOMAINS = "habitat-one.com";
    const { sendBulkMail, adresToegestaan } = await import("@/lib/leads/transport");
    expect(adresToegestaan("nick@habitat-one.com")).toBe(true);
    expect(adresToegestaan("iemand@sub.habitat-one.com")).toBe(true);
    expect(adresToegestaan("estudio@qbarquitectos.com")).toBe(false);

    const geroepen: string[] = [];
    vi.stubGlobal("fetch", (u: string) => {
      geroepen.push(u);
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: "x" }), text: async () => "" } as Response);
    });
    const res = await sendBulkMail({ to: "estudio@qbarquitectos.com", subject: "s", html: "h", text: "t" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fout).toContain("geblokkeerd");
    // En het belangrijkste: er is niets naar Resend gegaan.
    expect(geroepen).toEqual([]);
    delete process.env.CAMPAIGN_ALLOWED_DOMAINS;
  });

  it("laat alles door als er geen domeinslot is ingesteld", async () => {
    delete process.env.CAMPAIGN_ALLOWED_DOMAINS;
    const { adresToegestaan } = await import("@/lib/leads/transport");
    expect(adresToegestaan("estudio@qbarquitectos.com")).toBe(true);
  });

  it("weigert te versturen zonder sleutel, in plaats van stil terug te vallen", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendBulkMail, bulkGereed } = await import("@/lib/leads/transport");
    expect(bulkGereed()).toBe(false);
    const res = await sendBulkMail({ to: "a@b.es", subject: "s", html: "h", text: "t" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.opnieuw).toBe(false);
  });
});
