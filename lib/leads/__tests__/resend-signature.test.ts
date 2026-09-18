import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { controleerSvix, MAX_AFWIJKING_SEC } from "@/lib/leads/resend-signature";

const SECRET = "whsec_" + Buffer.from("geheim-van-resend-1234567890").toString("base64");
const BODY = JSON.stringify({ type: "email.bounced", data: { email_id: "abc" } });
const NU = 1_800_000_000_000; // vast moment
const TS = String(Math.floor(NU / 1000));
const ID = "msg_2abc";

const tekenen = (id = ID, ts = TS, body = BODY, secret = SECRET) =>
  "v1," +
  createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
    .update(`${id}.${ts}.${body}`)
    .digest("base64");

describe("signatuur van de Resend-webhook", () => {
  it("laat een geldig bericht door", () => {
    expect(controleerSvix(SECRET, { id: ID, timestamp: TS, signature: tekenen() }, BODY, NU)).toEqual({ ok: true });
  });

  it("weigert een bericht met een aangepaste body", () => {
    const anders = JSON.stringify({ type: "email.complained" });
    const r = controleerSvix(SECRET, { id: ID, timestamp: TS, signature: tekenen() }, anders, NU);
    expect(r.ok).toBe(false);
  });

  it("weigert een signatuur van een ander geheim", () => {
    const vreemd = "whsec_" + Buffer.from("heel-ander-geheim-0987654321").toString("base64");
    const r = controleerSvix(SECRET, { id: ID, timestamp: TS, signature: tekenen(ID, TS, BODY, vreemd) }, BODY, NU);
    expect(r.ok).toBe(false);
  });

  it("weigert een oud bericht — tegen herhalen", () => {
    const oud = String(Math.floor(NU / 1000) - MAX_AFWIJKING_SEC - 10);
    const r = controleerSvix(SECRET, { id: ID, timestamp: oud, signature: tekenen(ID, oud) }, BODY, NU);
    expect(r).toEqual({ ok: false, reden: "tijdstempel te oud of te ver in de toekomst" });
  });

  it("accepteert een bericht dat net binnen de marge valt", () => {
    const bijna = String(Math.floor(NU / 1000) - MAX_AFWIJKING_SEC + 5);
    expect(controleerSvix(SECRET, { id: ID, timestamp: bijna, signature: tekenen(ID, bijna) }, BODY, NU).ok).toBe(true);
  });

  it("accepteert meerdere signaturen in de header — bij het wisselen van een geheim", () => {
    const header = `v1,onzinonzinonzin ${tekenen()}`;
    expect(controleerSvix(SECRET, { id: ID, timestamp: TS, signature: header }, BODY, NU).ok).toBe(true);
  });

  it("weigert alles als de headers of het geheim ontbreken", () => {
    expect(controleerSvix("", { id: ID, timestamp: TS, signature: tekenen() }, BODY, NU).ok).toBe(false);
    expect(controleerSvix(SECRET, { id: null, timestamp: TS, signature: "x" }, BODY, NU).ok).toBe(false);
    expect(controleerSvix(SECRET, { id: ID, timestamp: null, signature: "x" }, BODY, NU).ok).toBe(false);
    expect(controleerSvix(SECRET, { id: ID, timestamp: TS, signature: null }, BODY, NU).ok).toBe(false);
  });

  it("weigert een onleesbaar tijdstempel", () => {
    expect(controleerSvix(SECRET, { id: ID, timestamp: "gisteren", signature: "v1,x" }, BODY, NU)).toEqual({
      ok: false,
      reden: "tijdstempel onleesbaar",
    });
  });
});
