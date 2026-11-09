import { describe, expect, it } from "vitest";
import { computeTotals } from "../documents";
import { planReturnFee } from "../return-fee";
import type { DocumentLineItem } from "../db/schema";
const goods:DocumentLineItem={name:"XPS Backer Board 30mm",units:148,price:82.6,taxRate:21,productId:"product-1",description:"XPS montageplaten"};
const fee:DocumentLineItem={name:"retained fee",units:1,price:-2218.8,taxRate:21};
const doc=(items:DocumentLineItem[])=>{const t=computeTotals(items);return {items,subtotalEur:t.subtotal.toFixed(2),taxEur:t.tax.toFixed(2),totalEur:t.total.toFixed(2)}};
describe("full return with retained fee",()=>{
 it("moves only the fee to an invoice and fully credits goods, preserving the net balance",()=>{const p=planReturnFee(doc([goods]),doc([goods,fee]))!;expect(p.totals).toEqual({subtotal:2218.8,tax:465.95,total:2684.75});expect(p.fullCredit.total).toBe(14792.01);expect(p.items.every(i=>!i.productId&&!i.costEur&&!i.advanceRef)).toBe(true);expect(p.creditItems).toEqual([goods]);expect(14792.01-p.fullCredit.total+p.totals.total).toBe(2684.75)});
 it("refuses partial returns even if the financial total seems plausible",()=>expect(planReturnFee(doc([goods]),doc([{...goods,units:147},fee]))).toBeNull());
 it("refuses fee lines linked to inventory",()=>expect(planReturnFee(doc([goods]),doc([goods,{...fee,productId:"other"}]))).toBeNull());
 it("refuses changed product, variant, VAT, price or inconsistent stored totals",()=>{for(const changed of [{productId:"other"},{description:"another SKU"},{taxRate:10},{price:80}])expect(planReturnFee(doc([goods]),doc([{...goods,...changed},fee]))).toBeNull();expect(planReturnFee({...doc([goods]),totalEur:"1"},doc([goods,fee]))).toBeNull()});
 it("supports legacy JSON and multiple VAT fee lines with discounts",()=>{const f={...fee,price:-100,discount:10,taxRate:10};const inv=doc([goods]);const cn=doc([goods,fee,f]);expect(planReturnFee({...inv,items:JSON.stringify(JSON.stringify(inv.items))},cn)?.totals).toEqual({subtotal:2308.8,tax:474.95,total:2783.75})});
 it("refuses zero fees and advance settlements",()=>{expect(planReturnFee(doc([goods]),doc([goods]))).toBeNull();expect(planReturnFee(doc([goods]),doc([goods,{...fee,advanceRef:"advance"}]))).toBeNull()});
});
