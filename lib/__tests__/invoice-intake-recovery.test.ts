import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({limit:vi.fn(),find:vi.fn(),proposal:vi.fn(),upsert:vi.fn()}));
vi.mock("@/lib/db",()=>{
  const builder={from:()=>builder,innerJoin:()=>builder,leftJoin:()=>builder,where:()=>builder,orderBy:()=>builder,limit:m.limit};
  return {db:{select:()=>builder,query:{emailInbox:{findFirst:m.find}}}};
});
vi.mock("@/lib/purchase-invoice-intake",()=>({
  FINANCIAL_CATEGORIES:["contractor"],isProformaOrQuote:(s:string)=>s.includes("proforma"),isSpecificationAttachment:(s:string)=>s.includes("specificatie"),
  buildInvoiceProposal:m.proposal,upsertInvoiceReview:m.upsert,buildPurchaseReference:vi.fn(),attachReviewToSibling:vi.fn(),
}));
import { recoverMissingInvoiceReviews } from "../auto-purchase-invoice";
beforeEach(()=>{vi.clearAllMocks();m.limit.mockResolvedValue([{emailId:"mail",attachmentId:"pdf",filename:"factuur.pdf"}]);m.find.mockResolvedValue({linkedPurchaseOrderId:null});m.proposal.mockResolvedValue({attachmentId:"pdf"});m.upsert.mockResolvedValue("review");});
describe("recovery after interrupted mail processing",()=>{
  it("queues an orphaned financial document for review, without approval",async()=>{expect(await recoverMissingInvoiceReviews()).toEqual(["review"]);expect(m.proposal).toHaveBeenCalledWith({emailId:"mail",attachmentId:"pdf"});expect(m.upsert).toHaveBeenCalledWith({attachmentId:"pdf"},"auto");});
  it("does not reopen an invoice manually linked during selection",async()=>{m.find.mockResolvedValue({linkedPurchaseOrderId:"po"});expect(await recoverMissingInvoiceReviews()).toEqual([]);expect(m.proposal).not.toHaveBeenCalled();});
  it("does not recover quotations or specifications as standalone invoices",async()=>{m.limit.mockResolvedValue([{filename:"proforma.pdf"},{filename:"specificatie.pdf"}]);expect(await recoverMissingInvoiceReviews()).toEqual([]);expect(m.proposal).not.toHaveBeenCalled();});
  it("limits expensive OCR recovery to one document per polling round",async()=>{m.limit.mockResolvedValue([{emailId:"mail",attachmentId:"a",filename:"a.pdf"},{emailId:"mail",attachmentId:"b",filename:"b.pdf"}]);await recoverMissingInvoiceReviews();expect(m.proposal).toHaveBeenCalledTimes(1);});
});
