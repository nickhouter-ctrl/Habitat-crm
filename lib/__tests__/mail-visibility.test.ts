import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { emailInbox, inboxSuggestions } from "@/lib/db/schema";
import { isMarketingGebruiker, mailZichtbaarVoor, marketingMailbox, voorstelZichtbaarVoor } from "@/lib/mail-visibility";

const MARKETING = "teresa@habitat-one.com";
const oud = process.env.GMAIL_MARKETING_USER;

beforeEach(() => {
  process.env.GMAIL_MARKETING_USER = MARKETING;
});
afterEach(() => {
  if (oud === undefined) delete process.env.GMAIL_MARKETING_USER;
  else process.env.GMAIL_MARKETING_USER = oud;
});

/** De filters worden alleen opgebouwd, niet uitgevoerd — geen database nodig. */
type Filter = Parameters<ReturnType<ReturnType<typeof db.select>["from"]>["where"]>[0];
const mailSql = (f: Filter) => db.select().from(emailInbox).where(f).toSQL();
const voorstelSql = (f: Filter) => db.select().from(inboxSuggestions).where(f).toSQL();

describe("privépostvak", () => {
  it("houdt het marketingpostvak weg bij een collega", () => {
    const q = mailSql(mailZichtbaarVoor("nick@habitat-one.com"));
    expect(q.sql).toContain("mailbox_user");
    expect(q.sql).toContain("is distinct from");
    expect(q.params).toContain(MARKETING);
  });

  it("gebruikt `is distinct from`, zodat oude mail zonder postvak blijft staan", () => {
    // Met `<>` zou NULL nooit waar zijn en zou de hele bestaande inbox verdwijnen.
    expect(mailSql(mailZichtbaarVoor("nick@habitat-one.com")).sql).not.toMatch(/mailbox_user"? <>/);
  });

  it("beperkt haar eigen blik niet — zij ziet ook hi@", () => {
    expect(mailZichtbaarVoor(MARKETING)).toBeUndefined();
    expect(mailZichtbaarVoor("TERESA@Habitat-One.com ")).toBeUndefined();
  });

  it("doet niets als er geen marketingpostvak is ingesteld", () => {
    delete process.env.GMAIL_MARKETING_USER;
    expect(marketingMailbox()).toBeNull();
    expect(mailZichtbaarVoor("nick@habitat-one.com")).toBeUndefined();
    expect(isMarketingGebruiker(MARKETING)).toBe(false);
  });

  it("herkent de eigenaar van het postvak, hoofdletters en spaties ten spijt", () => {
    expect(isMarketingGebruiker("  Teresa@Habitat-One.COM ")).toBe(true);
    expect(isMarketingGebruiker("nick@habitat-one.com")).toBe(false);
    expect(isMarketingGebruiker(null)).toBe(false);
  });

  it("laat ook de assistent-voorstellen van dat postvak weg bij een collega", () => {
    const q = voorstelSql(voorstelZichtbaarVoor("nick@habitat-one.com"));
    expect(q.sql).toContain("not exists");
    expect(q.sql).toContain("email_inbox");
    expect(q.params).toContain(MARKETING);
    expect(voorstelZichtbaarVoor(MARKETING)).toBeUndefined();
  });
});
