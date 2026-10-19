import { describe, expect, it } from "vitest";
import { DEALER_STAFFELS, brutomarge, distributeurPrijzen, margeVerkooppunt, staffelVoorBestelling, veiligePrijs } from "@/lib/distributeur-prijzen";
import { catalogusItems, type CatalogusPaneel } from "@/lib/distributeur-catalogus";
import { prijsVoorstelInvoer } from "@/lib/distributeur-invoer";

const panel: CatalogusPaneel = {id:"one",name:"Huge Travertine - Beige",sku:"MS-024",category:"Huge Travertine",imageUrl:null,widthMm:1200,heightMm:2400,description:null,price:206.5702,cost:44.13,vatRate:21,stockQty:114,additionalSizes:[{sku:"MS-024-1",label:"2400*600",priceEur:103.2645,stockQty:0},{sku:"MS-024-2",label:"2400*1200",priceEur:206.5702,costEur:37.42,stockQty:114}]};

describe("verkooppuntstaffels",()=>{
 it("follows the per-order pallet schedule of the price list",()=>{
   for(const [pallets,discount] of [[1,35],[2,35],[3,40],[9,40],[10,45],[40,45]])expect(staffelVoorBestelling(pallets).kortingPct).toBe(discount);
   expect(staffelVoorBestelling(0,true).kortingPct).toBe(50);
   expect(DEALER_STAFFELS.map(s=>s.kortingPct)).toEqual([35,40,45,50]);
   for(const tier of DEALER_STAFFELS)expect(prijsVoorstelInvoer.parse({staffel:tier.id}).staffel).toBe(tier.id);
   expect(prijsVoorstelInvoer.parse({}).staffel).toBe("pallets-1");
   for(const value of [0,0.5,-1,Infinity,NaN])expect(()=>staffelVoorBestelling(value)).toThrow();
 });
 it("distinguishes gross margin from markup",()=>{
   expect(brutomarge(48.75,15).eur).toBe(33.75);
   expect(brutomarge(48.75,15).pct).toBeCloseTo(69.230769);
 });
 it("guards every rounded quoted price across prices, costs and tiers",()=>{
   for(const price of [49.95,103.2645,206.5702,247.8926])for(const ratio of [.1,.2136,.3321,.6,.9])for(const tier of DEALER_STAFFELS){
     const p=distributeurPrijzen(price,price*ratio,{staffelId:tier.id})!;
     for(const [result,floor] of [[p.dealer,35],[p.display,30]] as const){
       if(result.ex!=null){expect(result.margePct!).toBeGreaterThanOrEqual(floor-1e-8);expect(result.ex).toBeLessThanOrEqual(p.adviesEx);expect(result.incl).toBeCloseTo(Math.round(result.ex*121)/100,8);}
     }
   }
 });
 it("replaces a loss-making 70% display price with a profitable product price",()=>{
   const p=distributeurPrijzen(247.8926,82.31)!;
   expect(247.8926*.3-82.31).toBeLessThan(0);
   expect(p.showroom).toBe(117.59);
   expect(p.display.begrensd).toBe(true);
   expect(p.display.margePct!).toBeGreaterThanOrEqual(30);
   expect(p.display.kortingPct!).toBeLessThan(60);
 });
 it("applies 50% only where it preserves the minimum dealer margin",()=>{
   const ordinary=distributeurPrijzen(100,20,{staffelId:"container"})!;
   expect(ordinary.verkooppunt).toBe(50);expect(ordinary.dealer.begrensd).toBe(false);
   const limited=distributeurPrijzen(100,40,{staffelId:"container"})!;
   expect(limited.verkooppunt).toBe(61.54);expect(limited.dealer.begrensd).toBe(true);
   expect(limited.dealer.margePct!).toBeGreaterThanOrEqual(35);
 });
 it("shows the retailer contribution from the actual purchase price before VAT and own costs",()=>{
   const start=distributeurPrijzen(100,20)!;
   expect(margeVerkooppunt(start)).toBe(35);
   expect(brutomarge(start.adviesEx,start.verkooppunt!).pct).toBe(35);
   const capped=distributeurPrijzen(100,40,{staffelId:"container"})!;
   expect(margeVerkooppunt(capped)).toBe(38.46);
   expect(brutomarge(capped.adviesEx,capped.verkooppunt!).pct).toBeCloseTo(38.46);
   expect(margeVerkooppunt(distributeurPrijzen(100)!)).toBeNull();
 });
 it("never quotes without usable costs or above the recommended price",()=>{
   for(const c of [null,0,-1,NaN,Infinity])expect(distributeurPrijzen(100,c)!.verkooppunt).toBeNull();
   expect(distributeurPrijzen(100,90)!.verkooppunt).toBeNull();
   expect(distributeurPrijzen(null)).toBeNull();
   expect(veiligePrijs(100,10,100,35,21).ex).toBeNull();
   expect(veiligePrijs(100,10,35,100,21).ex).toBeNull();
 });
});
describe("costs per panel size",()=>{
 it("preserves actual size prices and VAT instead of assuming €75/m²",()=>{
   const sizes=catalogusItems([panel])[0].maten;
   expect(sizes.map(s=>s.areaM2)).toEqual([1.44,2.88]);
   expect(sizes.map(s=>s.adviesIncl)).toEqual([124.95,249.95]);
   expect(sizes[1].verkooppunt).toBe(134.27);
   expect(sizes[1].verkooppuntIncl).toBe(162.47);
   expect(sizes[1].adviesEx/2.88).not.toBe(75);
 });
 it("does not publish a smaller size based only on an area estimate",()=>{
   const m=catalogusItems([panel])[0].maten[0];
   expect(m.kostenbron).toBe("raming");expect(m.geraamdeKost).toBe(22.065);
   expect(m.verkooppunt).toBeNull();expect(m.showroom).toBeNull();
 });
 it("takes the higher conflicting registered cost and applies extra costs by area",()=>{
   const m=catalogusItems([panel],{extraKostenPerM2:5})[0].maten[1];
   expect(m.kostenbron).toBe("conservatief");expect(m.geregistreerdeKost).toBe(44.13);
   expect(m.kostEx).toBeCloseTo(58.53);expect(m.extraKost).toBeCloseTo(14.4);
   expect(m.display.margePct!).toBeGreaterThanOrEqual(30);
 });
 it("can quote an individually recorded smaller size",()=>{
   const p={...panel,additionalSizes:[{...panel.additionalSizes![0],costEur:26}]};
   const m=catalogusItems([p])[0].maten[0];expect(m.kostenbron).toBe("maat");expect(m.verkooppunt).toBe(67.12);
 });
 it("uses the product VAT rate and refuses unbounded cost input",()=>{
   expect(catalogusItems([{...panel,vatRate:10}])[0].maten[1].adviesIncl).toBe(227.23);
   for(const extra of [-1,Infinity,NaN,1001])expect(()=>catalogusItems([panel],{extraKostenPerM2:extra})).toThrow();
   for(const extra of ["-1","Infinity","1001"])expect(prijsVoorstelInvoer.safeParse({extra}).success).toBe(false);
   expect(prijsVoorstelInvoer.safeParse({staffel:"unknown"}).success).toBe(false);
 });
});
