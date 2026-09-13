import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ mail: vi.fn(), attachments: vi.fn(), insert: vi.fn(), proposal: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  query: { emailInbox: { findFirst: m.mail } },
  select: () => ({ from: () => ({ where: m.attachments }) }),
  insert: () => ({ values: (v: unknown) => ({ onConflictDoNothing: () => m.insert(v) }) }),
} }));
vi.mock("@/lib/purchase-invoice-intake", () => ({
  FINANCIAL_CATEGORIES: ["contractor"],
  isProformaOrQuote: (s: string) => /proforma/i.test(s),
  isSpecificationAttachment: () => false,
  buildPurchaseReference: (_s: string, f: string) => f,
  buildInvoiceProposal: m.proposal, upsertInvoiceReview: m.upsert, attachReviewToSibling: vi.fn(),
}));
import { tryAutoCreatePurchaseInvoice } from "../auto-purchase-invoice";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GMAIL_PURCHASE_USER", "purchase@habitat-one.com");
  m.mail.mockResolvedValue({ toEmail: "purchase@habitat-one.com", linkedPurchaseOrderId: null });
  m.attachments.mockResolvedValue([
    { id: "a", category: "contractor", filename: "factuur.pdf" },
    { id: "b", category: "contractor", filename: "factuur2.pdf" },
  ]);
  m.insert.mockResolvedValue(undefined);
  m.proposal.mockResolvedValue({ supplier: null, total: null });
  m.upsert.mockResolvedValue("review");
});
describe("durable invoice queue before OCR", () => {
  it("persists all cards before reading the first document", async () => {
    m.proposal.mockImplementation(async () => {
      expect(m.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ mailAttachmentId: "a", aiReadOk: false }),
        expect.objectContaining({ mailAttachmentId: "b", aiReadOk: false }),
      ]));
      return { supplier: null, total: null };
    });
    const result = await tryAutoCreatePurchaseInvoice("mail");
    expect(result.created).toBe(2);
    expect(m.insert).toHaveBeenCalledTimes(1);
  });
  it("retains queued cards when extraction throws and flags manual review", async () => {
    m.proposal.mockRejectedValue(new Error("OCR unavailable"));
    const result = await tryAutoCreatePurchaseInvoice("mail");
    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(result.needsReview).toBe(2);
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("does not queue a manually linked invoice or a proforma", async () => {
    m.mail.mockResolvedValueOnce({ linkedPurchaseOrderId: "po" });
    await tryAutoCreatePurchaseInvoice("linked");
    m.attachments.mockResolvedValue([{ id: "p", category: "contractor", filename: "proforma.pdf" }]);
    await tryAutoCreatePurchaseInvoice("proforma");
    expect(m.insert).not.toHaveBeenCalled();
  });
});
