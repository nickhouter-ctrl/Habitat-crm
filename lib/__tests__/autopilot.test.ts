import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { namesMatch, ruleProblems, splitVat, type AccountCandidate } from "@/lib/autopilot/account-check";
import { isChanged } from "@/lib/autopilot/lessons";
import { diffItems, judgeQuote, MIN_MARGIN_PCT, type QuoteLineCheck } from "@/lib/autopilot/quotes";

const person: AccountCandidate = { name: "Marieke de Vries", email: "marieke@ziggo.nl", phone: "+34 612 345 678", kind: "particulier", source: "website", businessName: null, vatNumber: null, message: "Graag een account" };

describe("account checks", () => {
  it("accepts a normal private request", () => {
    expect(ruleProblems(person)).toEqual([]);
  });
  it("flags fake names, disposable mail, bad phones and links", () => {
    expect(ruleProblems({ ...person, name: "test" })).toContain("Naam lijkt nep");
    expect(ruleProblems({ ...person, email: "x@mailinator.com" })).toContain("Wegwerp-e-mailadres");
    expect(ruleProblems({ ...person, phone: "111111111" })).toContain("Telefoonnummer klopt niet");
    expect(ruleProblems({ ...person, message: "zie www.spam.biz" })).toContain("Bericht bevat een link (spamkenmerk)");
  });
  it("requires company name and VAT for business and Windows", () => {
    expect(ruleProblems({ ...person, kind: "zakelijk" })).toEqual(expect.arrayContaining(["Bedrijfsnaam ontbreekt", "Btw-nummer ontbreekt"]));
    expect(ruleProblems({ ...person, source: "windows" })).toContain("Windows-toegang alleen zakelijk");
  });
  it("splits VAT numbers, defaulting to Spain", () => {
    expect(splitVat("ES B-12.345.678")).toEqual({ country: "ES", number: "B12345678" });
    expect(splitVat("B12345678")).toEqual({ country: "ES", number: "B12345678" });
    expect(splitVat("NL123456789B01")).toEqual({ country: "NL", number: "123456789B01" });
    expect(splitVat("GR123456789")).toEqual({ country: "EL", number: "123456789" });
  });
  it("matches company names ignoring legal forms", () => {
    expect(namesMatch("Reformas Costa Blanca S.L.", "REFORMAS COSTA BLANCA SL")).toBe(true);
    expect(namesMatch("Habitat One", "ACME TRADING SL")).toBe(false);
  });
});

const line = (o: Partial<QuoteLineCheck> = {}): QuoteLineCheck => ({ name: "Travertin", units: 10, unit: "m²", price: 100, cost: 50, problems: [], ...o });

describe("quote judgement", () => {
  it("passes a clear quote with enough margin", () => {
    expect(judgeQuote([line()], true, true)).toEqual({ reasons: [], marginPct: 50 });
  });
  it(`blocks margins under ${MIN_MARGIN_PCT}%`, () => {
    const r = judgeQuote([line({ cost: 75 })], true, true);
    expect(r.marginPct).toBe(25);
    expect(r.reasons[0]).toMatch(/Marge 25%/);
  });
  it("blocks unclear requests, missing AI and line problems", () => {
    expect(judgeQuote([line()], false, true).reasons).toHaveLength(1);
    expect(judgeQuote([line()], true, false).reasons).toHaveLength(1);
    expect(judgeQuote([line({ problems: ["geen verkoopprijs"] })], true, true).reasons).toContain("Travertin: geen verkoopprijs");
    expect(judgeQuote([], true, true).reasons).toContain("Geen producten in de aanvraag");
  });
  it("has no margin when a cost is missing", () => {
    expect(judgeQuote([line({ cost: null, problems: ["geen inkoop-/kostprijs bekend"] })], true, true).marginPct).toBeNull();
  });
});

describe("learning", () => {
  it("treats whitespace/case-only edits as unchanged", () => {
    expect(isChanged("Hallo  Piet,\nGroet", "hallo piet, groet")).toBe(false);
    expect(isChanged("Hallo Piet", "Hoi Piet")).toBe(true);
  });
  it("describes line edits", () => {
    const before = [{ name: "A", units: 10, price: 100, productId: "a" }, { name: "B", units: 1, price: 5, productId: "b" }];
    const after = [{ name: "A", units: 12, price: 95, productId: "a" }, { name: "C", units: 2, price: 7 }];
    expect(diffItems(before, after)).toBe("A: aantal 10 → 12; A: prijs 100 → 95; verwijderd: B; toegevoegd: 2 × C à 7");
  });
});
