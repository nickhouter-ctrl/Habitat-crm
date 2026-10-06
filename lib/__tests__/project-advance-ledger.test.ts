import { describe, expect, it } from "vitest";
import { projectAdvanceLedger } from "../project-advance-ledger";
import { projectReceiptShares, recordedDocumentReceipt, splitProjectReceipts } from "../receipts";
const line = (name: string, price: number, advanceRef?: string) => ({name, price, units:1, advanceRef});
const doc = (id: string, items: unknown, subtotal = 1000, status = "paid") => ({id, kind:"invoice", status, items, subtotalEur:String(subtotal), subtotal:String(subtotal), docNumber:id, issueDate:null, isAdvance:false, settledAt:null});
const pay = (id: string, documentId: string | null, amountEur: number) => ({id, documentId, amountEur, method:"advance", vatRate:"0", date:null, description:null});
describe("advance history", () => {
  it("does not recreate a cash receipt for an invoice settled by credit", () => {
    expect(recordedDocumentReceipt("invoice","0.00","5077.50")).toBe(0);
    expect(recordedDocumentReceipt("invoice","5077.50","5077.50")).toBe(5077.50);
    expect(recordedDocumentReceipt("creditnote","0.00","5077.50")).toBe(-0);
    expect(recordedDocumentReceipt("creditnote","5077.50","5077.50")).toBe(-5077.50);
  });
  it("combines cash and invoice advances, excluding goods and unpaid drafts from receipts", () => {
    const result = projectAdvanceLedger([
      doc("mixed", [line("Kozijnen",24000),line("Voorschot werkzaamheden",15000)],39000),
      {...doc("request",[line("Voorschot",20000)],20000,"draft"),kind:"proforma"},
    ], [pay("cash",null,20000), pay("invoice","mixed",39000)]);
    expect(result.received).toBe(35000);
    expect(result.open).toBe(35000);
    expect(result.rows.find(r=>r.id==="request")?.received).toBe(0);
    expect(result.rows.find(r=>r.id==="mixed")?.amount).toBe(15000);
  });
  it("links a converted proforma without counting the same invoice payment twice", () => {
    const items=[line("Kozijnen",24000),line("Voorschot werkzaamheden",15000)];
    const proforma={...doc("proforma",items,39000,"accepted"),kind:"proforma",sourceDocumentId:"quote"};
    const invoice={...doc("invoice",items,39000),sourceDocumentId:"quote"};
    const result=projectAdvanceLedger([proforma,invoice],[pay("receipt","invoice",39000)]);
    expect(result.received).toBe(15000);
    expect(result.rows.find(r=>r.id==="proforma")).toMatchObject({received:0,open:0,replacedBy:{id:"invoice"}});
  });
  it("counts partial payments and recorded settlement only once; draft settlement does not count", () => {
    const docs=[doc("advance",[line("1st term exterior works",10000)],10000),doc("final",[line("Kozijnen",8000),line("Verrekening",-4000,"advance")],4000),doc("draft",[line("Verrekening",-6000,"advance")],-6000,"draft")];
    const result=projectAdvanceLedger(docs,[pay("receipt","advance",8000)]);
    expect(result).toMatchObject({received:8000,settled:4000,open:4000});
  });
});
describe("product reservations after settling an advance", () => {
  const docs=[doc("advance",[line("Voorschot",10000)],10000),doc("final",[line("Warmtepomp compleet",30000),line("Arbeid",10000),line("Verrekening",-10000,"advance")],30000)];
  it("reserves the complete goods price over original advance and final receipt",()=>{
    const payments=[pay("a","advance",10000),pay("b","final",30000)];
    expect(splitProjectReceipts(payments,projectReceiptShares(docs,payments))).toEqual({totalReceived:40000,ownProductReceived:30000,liquidReceived:10000});
  });
  it("reserves only received money for partial final payment",()=>{
    const payments=[pay("a","advance",10000),pay("b","final",10000)];
    expect(splitProjectReceipts(payments,projectReceiptShares(docs,payments))).toEqual({totalReceived:20000,ownProductReceived:15000,liquidReceived:5000});
  });
  it("keeps a not-yet-settled advance available when the final invoice is draft",()=>{
    const payments=[pay("a","advance",10000)];
    expect(splitProjectReceipts(payments,projectReceiptShares([docs[0],{...docs[1],status:"draft"}],payments)).liquidReceived).toBe(10000);
  });
  it("does not transfer funds from a reference outside the supplied project",()=>{
    expect(projectReceiptShares([docs[1]],[pay("x","foreign",10000)]).has("foreign")).toBe(false);
  });
});
