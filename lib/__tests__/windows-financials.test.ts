import { describe, expect, it } from "vitest";
import { filterWindowsDealer, invoiceAmounts, latestWindowsQuotes, summarizeWindows, type WindowsData, type WindowsInvoice, type WindowsOrder, type WindowsQuote } from "../windows-financials";

const order:WindowsOrder={id:"order-a",number:"ORD-A",dealerId:"a",status:"production",createdAt:"2026-09-12",customer:"Customer",project:"Project",elements:3,m2:6.4,factory:2000,factoryFinal:true,cost:3100,dealerPrice:4340,profit:1240,markupPct:0.4,plannedDelivery:null,invoiced:0,paid:0,open:0};
const quote:WindowsQuote={id:"quote-a",number:"Q-1",version:1,dealerId:"a",status:"sent",createdAt:"2026-09-12",customer:"Customer",project:"Project",elements:3,m2:6.4,dealerPrice:4340};
const bill=(status="sent"):WindowsInvoice=>({id:"invoice-a",number:"FAC-1",orderId:order.id,orderNumber:order.number,dealerId:"a",kind:"deposit",issuedAt:"2026-09-12",dueAt:"2026-09-26",crmDocumentId:"crm-copy",...invoiceAmounts({netCents:217000,grossCents:262570,status})});
const data:WindowsData={dealers:[],orders:[order],quoteRows:[quote],invoices:[bill()]};

describe("Windows source totals",()=>{
  it("converts cents and distinguishes invoice amounts including and excluding VAT",()=>{
    const {totals}=summarizeWindows(data);
    expect(totals.invoiced).toBe(2170);
    expect(totals.invoicedGross).toBe(2625.7);
    expect(totals.open).toBe(2625.7);
    expect(totals.profit).toBe(1240);
    expect(totals.elements).toBe(3);
  });
  it("uses the Windows payment once even when the invoice links to CRM",()=>{
    const {totals}=summarizeWindows({...data,invoices:[bill("paid")]});
    expect(totals.paidGross).toBe(2625.7);expect(totals.paid).toBe(2170);expect(totals.open).toBe(0);
  });
  it("keeps unpaid invoices visible when an order is cancelled",()=>{
    const {totals}=summarizeWindows({...data,orders:[{...order,status:"cancelled"}]});
    expect(totals.orders).toBe(0);expect(totals.dealer).toBe(0);expect(totals.open).toBe(2625.7);
  });
  it("excludes cancelled invoices from every financial total",()=>{
    const {totals}=summarizeWindows({...data,invoices:[bill("cancelled")]});
    expect(totals.invoiced).toBe(0);expect(totals.paid).toBe(0);expect(totals.open).toBe(0);
  });
  it("counts the latest version once, separately for dealers with the same quote number",()=>{
    const quoteRows=[quote,{...quote,id:"v2",version:2,status:"accepted"},{...quote,id:"b",dealerId:"b"}];
    expect(latestWindowsQuotes(quoteRows).map(q=>q.id)).toEqual(["v2","b"]);
    expect(summarizeWindows({...data,quoteRows}).quotes).toEqual({open:1,openValue:4340,accepted:1});
  });
  it("keeps dealer, own-project and missing-dealer selections separate",()=>{
    const mixed={...data,orders:[order,{...order,id:"own",dealerId:null},{...order,id:"other",dealerId:"b"}]};
    expect(filterWindowsDealer(mixed,"a").orders.map(o=>o.id)).toEqual(["order-a"]);
    expect(filterWindowsDealer(mixed,"own").orders.map(o=>o.id)).toEqual(["own"]);
    expect(summarizeWindows(filterWindowsDealer(mixed,"missing")).totals.orders).toBe(0);
    expect(filterWindowsDealer(mixed,"b").invoices).toEqual([]);
  });
});
