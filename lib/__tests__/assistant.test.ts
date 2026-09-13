import { describe, expect, it } from "vitest";
import { canAutoArchive, suggestMail, type MailInput } from "../assistant/mail-rules";
import { checkQuote } from "../assistant/quote-checks";
const newsletter: MailInput = { id: "mail", subject: "September sale", bodyText: "Discount this week. Unsubscribe", fromEmail: "newsletter@example.com", receivedAt: new Date() };
describe("CRM automatic archive boundary", () => {
  it("permits only recognisable marketing with an unsubscribe indication", () => {
    expect(canAutoArchive(newsletter, false)).toBe(true);
    expect(canAutoArchive({ ...newsletter, bodyText: "Discount this week" }, false)).toBe(false);
  });
  it("protects every known contact, linked message and attachment", () => {
    expect(canAutoArchive(newsletter, true)).toBe(false);
    expect(canAutoArchive({ ...newsletter, linkedPurchaseOrderId: "po" }, false)).toBe(false);
    expect(canAutoArchive({ ...newsletter, linkedQuoteRequestId: "request" }, false)).toBe(false);
    expect(canAutoArchive({ ...newsletter, attachments: [{ filename: "invoice.pdf" }] }, false)).toBe(false);
  });
  it.each(["Factuur 12", "Invoice overdue", "Klant aanvraag", "Offerte badkamer", "Project levering", "Request information", "Renovation enquiry", "We have a complaint", "Kunnen jullie helpen?", "Payment receipt"])("protects transactional or actionable content: %s", subject => {
    expect(canAutoArchive({ ...newsletter, subject }, false)).toBe(false);
  });
  it("does not archive unknown senders solely because their text looks promotional", () => {
    expect(canAutoArchive({ ...newsletter, fromEmail: "nick@example.com" }, false)).toBe(false);
  });
  it("keeps unsure mail important and never invents a deadline", () => {
    const result = suggestMail({ ...newsletter, subject: "Hello", bodyText: "Please get in touch" });
    expect(result.category).toBe("important"); expect(result.needsReply).toBe(true); expect(result.deadline).toBeNull();
  });
});
describe("quote controls are suggestions without changing prices", () => {
  it("accepts cost plus 15% and catalog sale prices without extra markup", () => {
    expect(checkQuote([{ name: "Uren", units: 10, price: 46, costEur: 40, pricingBasis: "construction", taxRate: 21 },
      { name: "Meubel", units: 1, price: 790, pricingBasis: "catalog", productId: "p", taxRate: 21 }], new Map([["p", 790]]))).toEqual([]);
  });
  it("flags double markup without changing the original", () => {
    const item = { name: "Meubel", units: 1, price: 1027, pricingBasis: "catalog" as const, productId: "p", taxRate: 21 };
    expect(checkQuote([item], new Map([["p", 790]]))).toHaveLength(1); expect(item.price).toBe(1027);
  });
  it("flags missing data, duplicate items and discounted construction markup", () => {
    expect(checkQuote([])).toHaveLength(1);
    const item = { name: "Uren", units: 10, price: 46, costEur: 40, discount: 20, pricingBasis: "construction" as const, taxRate: 21 };
    expect(checkQuote([item, item]).some(c => c.includes("dubbele"))).toBe(true);
    expect(checkQuote([item]).some(c => c.includes("15%"))).toBe(true);
  });
});
