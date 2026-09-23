/**
 * Het Resend-pad van sendEmail: bcc moet een LIJST zijn.
 *
 * Kwam boven water bij het opnieuw sturen van een afspraakvoorstel: zonder
 * Gmail-instelling gaat alles via Resend, en die weigerde elke mail met
 * 422 validation_error — "Invalid `bcc` field". Intern is de bcc één string met
 * komma's (nodemailer wil dat zo), en die ging ongesplitst mee. Gevolg: zodra
 * het Gmail-pad wegvalt gaat er geen enkele mail meer uit, terwijl de vaste
 * bedrijfs-bcc op élke mail zit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "@/lib/email";

const oud = { ...process.env };
let payloads: Record<string, unknown>[] = [];

beforeEach(() => {
  payloads = [];
  // Geen Gmail → Resend-pad. Expliciet leeg zetten: het kan uit een ander
  // testbestand in dezelfde worker nog gevuld staan.
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.EMAIL_BCC;
  delete process.env.NOTIFY_EMAIL;
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Habitat One <hi@habitat-one.com>";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      payloads.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => "" } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...oud };
});

describe("sendEmail via Resend", () => {
  it("stuurt de bcc als lijst van losse adressen", async () => {
    const res = await sendEmail({ to: "klant@example.com", subject: "Hallo", html: "<p>hoi</p>" });
    expect(res.sent).toBe(true);
    const bcc = payloads[0].bcc;
    expect(Array.isArray(bcc)).toBe(true);
    for (const adres of bcc as string[]) {
      expect(adres).not.toContain(",");
      expect(adres.trim()).toBe(adres);
      expect(adres).toMatch(/^[^@\s]+@[^@\s]+$/);
    }
    expect(payloads[0].to).toBe("klant@example.com");
    expect(payloads[0].from).toBe("Habitat One <hi@habitat-one.com>");
  });

  it("laat de bcc weg als er niemand mee hoeft te lezen", async () => {
    await sendEmail({ to: "klant@example.com", subject: "Persoonlijk", html: "<p>link</p>", noCompanyBcc: true });
    expect(payloads[0]).not.toHaveProperty("bcc");
  });

  it("neemt een extra bcc mee, netjes gesplitst", async () => {
    await sendEmail({ to: "klant@example.com", subject: "Met kopie", html: "<p>hoi</p>", bcc: "extra@example.com" });
    expect(payloads[0].bcc).toContain("extra@example.com");
  });
});
