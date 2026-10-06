import { describe, expect, it } from "vitest";
import { projectCostStreams, projectOwnProducts, splitLooseCost, splitPurchaseCost } from "../project-cost-streams";
import { deriveProjectMargins } from "../project-financials";

describe("project cost streams",()=>{
  it("keeps Spanish supplier materials, including lighting, outside our own assortment",()=>{
    const result=splitPurchaseCost({supplier:"Obramat España",subtotal:100,items:[{name:"Verlichting",units:1,unitPrice:100}]});
    expect(result.material).toBe(100);expect(result.own).toBe(0);
  });
  it("recognizes our imported windows and their handling without changing total costs",()=>{
    const result=projectCostStreams([
      {supplier:"Foshan Hanhai",subtotal:9742.52,items:[{name:"Aluminium ramen & deuren",units:1,unitPrice:9742.52}]},
      {supplier:"Foshan Hanhai",subtotal:1461.38,notes:"Handling bij eigen kozijnen",items:[{name:"Windows & Doors handling",units:1,unitPrice:1461.38}]},
    ],[]);
    expect(result.own).toBe(11203.90);expect(result.material).toBe(0);expect(result.groups.get("windows")).toBe(11203.90);
  });
  it("uses catalogue links for our own lighting and splits mixed orders to the cent",()=>{
    const split=splitPurchaseCost({subtotal:120.01,items:[{name:"Lighting",productId:"catalog-light",units:1,unitPrice:80},{name:"Cement",units:1,unitPrice:40}]});
    expect(split.own).toBe(80.01);expect(split.material).toBe(40);expect(split.own+split.material+split.other).toBe(120.01);
  });
  it("does not turn cement into own products because a mixed import mentions windows",()=>{
    const split=splitPurchaseCost({supplier:"Foshan",notes:"Windows import",subtotal:100,items:[{name:"Windows",units:1,unitPrice:60},{name:"Cement",units:1,unitPrice:40}]});
    expect(split.own).toBe(60);expect(split.material).toBe(40);
  });
  it("keeps architects, equipment hire and transport separate from materials",()=>{
    const result=projectCostStreams([{subtotal:100,items:[{name:"Huur container",units:1,unitPrice:100}]}],[
      {amountEur:1900,description:"Architect",category:"subcontractor"},
      {amountEur:500,description:"Bouwmaterialen gekocht door ons",category:"material"},
    ]);
    expect(result.other).toBe(2000);expect(result.material).toBe(500);expect(result.own).toBe(0);
  });
  it("keeps installation and labour invoices out of own goods",()=>{
    expect(splitPurchaseCost({supplier:"Foshan",subtotal:100,items:[{name:"montage kozijnen",units:1,unitPrice:100}]}).other).toBe(100);
    expect(splitPurchaseCost({countAsLabor:true,subtotal:100,items:[]}).own).toBe(0);
  });
  it("handles double-encoded imports and real supplier credits",()=>{
    const result=splitPurchaseCost({supplier:"Foshan",subtotal:-100,items:JSON.stringify(JSON.stringify([{name:"Ballustrades",units:1,unitPrice:-100}]))});
    expect(result.own).toBe(-100);expect(result.groups.get("railings")).toBe(-100);
  });
  it("recognizes our imported LED products and an explicit own-stock designation",()=>{
    expect(splitPurchaseCost({supplier:"Foshan",subtotal:100,items:[{name:"LED strips",units:1,unitPrice:100}]}).own).toBe(100);
    expect(splitPurchaseCost({notes:"Eigen voorraad",subtotal:100,items:[{name:"Custom product",units:1,unitPrice:100}]}).own).toBe(100);
  });
  it("classifies an allocated supplier cost without copying the entire invoice",()=>{
    const result=splitLooseCost({amountEur:20,description:"Aandeel inkoopfactuur",category:"material",source:{supplier:"Foshan",items:[{name:"Kozijnen",units:1,unitPrice:100}]}});
    expect(result.own).toBe(20);
  });
});

describe("own product costs and margins",()=>{
  const invoice=(items:unknown)=>({kind:"invoice",status:"paid",items});
  it("uses Finca's booked window cost where its sales line has no cost",()=>{
    const result=projectOwnProducts([invoice([{name:"kozijnen Finca Lisa",units:1,price:24029.84}])],new Map([["windows",11203.90]]));
    expect(result).toEqual({revenue:24029.84,cost:11203.90,uncosted:0,totalRevenue:24029.84,bookedCost:11203.90});
  });
  it("does not double-count a supplier cost already represented on the sales line",()=>{
    const result=projectOwnProducts([invoice([{name:"Kozijnen",units:1,price:100,costEur:60}])],new Map([["windows",60]]));
    expect(result.cost).toBe(60);expect(result.bookedCost).toBe(60);
  });
  it("shows all product revenue without treating missing costs as zero",()=>{
    const result=projectOwnProducts([invoice([{name:"Kozijnen",units:1,price:100},{name:"Badkamer artikelen",units:1,price:200}])],new Map([["windows",60]]));
    expect(result.revenue).toBe(100);expect(result.cost).toBe(60);expect(result.uncosted).toBe(200);expect(result.totalRevenue).toBe(300);
  });
  it("keeps unsold booked goods as a product cost outside work funding",()=>{
    const result=projectOwnProducts([],new Map([["railings",60]]));
    expect(result.bookedCost).toBe(60);expect(result.revenue).toBe(0);
  });
  it("matches actual negative product refunds without producing an unknown-cost profit",()=>{
    const result=projectOwnProducts([{kind:"creditnote",status:"sent",items:[{name:"Kozijnen",units:1,price:100}]}],new Map([["windows",-60]]));
    expect(result.revenue).toBe(-100);expect(result.cost).toBe(-60);expect(result.bookedCost).toBe(-60);expect(result.uncosted).toBe(0);
  });
  it("preserves the configured markup on other project costs without mixing it into material costs",()=>{
    const m=deriveProjectMargins({laborCost:100,purchaseCost:50,otherCost:20,productRevenue:100,productCost:60});
    expect(m.purchaseCost).toBe(50);expect(m.otherCost).toBe(20);expect(m.otherRevenue).toBe(23);expect(m.totalRevenue).toBe(295.5);expect(m.costToDate).toBe(230);
  });
});
