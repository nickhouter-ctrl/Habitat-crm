import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), attachment: vi.fn(), insert: vi.fn(), existing: vi.fn(), after: vi.fn(), proposal: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireModule: m.auth }));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { mailAttachments: { findFirst: m.attachment }, purchaseInvoiceReviews: { findFirst: m.existing } },
  insert: () => ({ values: (v: unknown) => ({ onConflictDoNothing: () => ({ returning: () => m.insert(v) }) }) }),
} }));
vi.mock("@/lib/purchase-invoice-intake", () => ({ buildInvoiceProposal: m.proposal, upsertInvoiceReview: m.upsert }));
import { queueMailInvoice } from "../../app/(app)/inbox/queue-invoice";
const email = "11111111-1111-4111-8111-111111111111", att = "22222222-2222-4222-8222-222222222222";
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ id: "user" }); m.attachment.mockResolvedValue({ id: att, emailId: email, filename: "factuur.pdf" }); m.insert.mockResolvedValue([{ id: "review", status: "pending" }]); m.proposal.mockResolvedValue({ total: 100 }); });
describe("manually queue a mail invoice without booking it", () => {
  it("persists a pending card immediately and defers AI extraction", async () => {
    expect(await queueMailInvoice(email, att)).toEqual({ id: "review", status: "pending" });
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ emailId: email, mailAttachmentId: att, source: "manual", aiReadOk: false }));
    expect(m.proposal).not.toHaveBeenCalled(); expect(m.after).toHaveBeenCalledTimes(1);
    await m.after.mock.calls[0][0]();
    expect(m.upsert).toHaveBeenCalledWith({ total: 100 }, "manual");
  });
  it("does not re-read or reopen an already approved invoice", async () => {
    m.insert.mockResolvedValue([]); m.existing.mockResolvedValue({ id: "old", status: "approved" });
    expect(await queueMailInvoice(email, att)).toEqual({ id: "old", status: "approved" }); expect(m.after).not.toHaveBeenCalled();
  });
  it("rejects a mismatched attachment before any write", async () => {
    m.attachment.mockResolvedValue({ emailId: "another", filename: "factuur.pdf" });
    await expect(queueMailInvoice(email, att)).rejects.toThrow("hoort niet"); expect(m.insert).not.toHaveBeenCalled();
  });
  it("rejects unauthorised writes", async () => {
    m.auth.mockRejectedValue(new Error("Alleen lezen")); await expect(queueMailInvoice(email, att)).rejects.toThrow("Alleen lezen"); expect(m.attachment).not.toHaveBeenCalled();
  });
});
