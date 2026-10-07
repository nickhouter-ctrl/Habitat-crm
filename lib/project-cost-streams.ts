import type { DocumentLineItem } from "@/lib/db/schema";
import { isOwnProductLine, lineMaterialCostEur, lineNet, normalizeDocItems, ownProductGroup } from "@/lib/documents";
import { parsePoLineItems, poExVatAmount } from "@/lib/purchase-orders";

type Purchase = Parameters<typeof poExVatAmount>[0] & { notes?: string | null; supplier?: string | null; currency?: string; countAsLabor?: boolean };
type Cost = { amountEur: string | number; description: string; category?: string; note?: string | null; source?: Purchase | null };
type Split = { material: number; other: number; own: number; groups: Map<string, number> };
const round = (n: number) => Math.round(n * 100) / 100;
const service = /\b(architect\w*|arquitect\w*|topograf\w*|topograph\w*|survey\w*|containers?|huur|rental|alquiler|transport|vervoer|onderaannemer\w*|subcontract\w*|montage|installatie|installation|instalacion|arbeid|labor|labour)\b/i;
const goods = (name: string, productId?: string, sku?: string): DocumentLineItem => ({name,productId,description:sku,units:1,price:0});
const ownOrigin = /\b(eigen producten|eigen voorraad|china|foshan|hanhai|kingkonree|magic stone|zimmermann plantas|import\w*|invoer\w*|landed)\b/i;

/** Preserve every booked euro; only its stream changes. Mixed orders split by line value. */
export function splitPurchaseCost(po: Purchase, amount = poExVatAmount(po)): Split {
  const result: Split = {material:0,other:0,own:0,groups:new Map()};
  if (po.countAsLabor || amount === 0) return result;
  const lines = parsePoLineItems(po.items);
  const ownSupplier = ownOrigin.test(`${po.supplier ?? ""} ${po.notes ?? ""}`);
  const explicitOwn = /\beigen (producten|voorraad)\b/i.test(po.notes ?? "");
  const total = lines.reduce((s,it)=>s+Math.abs(it.units*it.unitPrice),0);
  const classify = (item: DocumentLineItem) => isOwnProductLine(item) && (item.productId || ownSupplier) ? ownProductGroup(item) : service.test(item.name) ? "other" : explicitOwn ? ownProductGroup(item) : "material";
  const context = classify(goods(po.notes ?? ""));
  const weights = new Map<string,number>();
  if (total > 0) for (const it of lines) {
    let group = classify(goods(it.name,it.productId,it.sku));
    if (group === "material" && context !== "material" && !service.test(it.name)
      && !/\b(tegels?|lijm|cement|hout|bouwmaterial\w*|tiles?|adhesive|bricks?|plaster|materiales?)\b/i.test(it.name)) group = context;
    weights.set(group,(weights.get(group)??0)+Math.abs(it.units*it.unitPrice)/total);
  } else weights.set(context,1);
  const entries = [...weights]; let allocated = 0;
  for (let i=0;i<entries.length;i++) {
    const [group,share]=entries[i];
    const value=i===entries.length-1?round(amount-allocated):round(amount*share); allocated=round(allocated+value);
    if (group === "material") result.material += value;
    else if (group === "other") result.other += value;
    else {result.own += value;result.groups.set(group,value);}
  }
  return result;
}

export function splitLooseCost(c: Cost): Split {
  const amount = Number(c.amountEur)||0;
  if (["subcontractor","equipment","other"].includes(c.category ?? "")) return {material:0,other:amount,own:0,groups:new Map()};
  if (isOwnProductLine(goods(c.description)) && ownOrigin.test(`${c.description} ${c.note ?? ""}`)) return {material:0,other:0,own:amount,groups:new Map([[ownProductGroup(goods(c.description)),amount]])};
  if (c.source && !c.source.countAsLabor) return splitPurchaseCost(c.source,amount);
  return {material:service.test(c.description)?0:amount,other:service.test(c.description)?amount:0,own:0,groups:new Map()};
}

export function projectCostStreams(purchases: Purchase[], costs: Cost[]) {
  const result = {materialPo:0,materialLoose:0,otherPo:0,otherLoose:0,ownPo:0,ownLoose:0,groups:new Map<string,number>()};
  const collect=(split:Split,source:"Po"|"Loose")=>{
    result[`material${source}`]+=split.material; result[`other${source}`]+=split.other; result[`own${source}`]+=split.own;
    for(const [group,cost] of split.groups) result.groups.set(group,round((result.groups.get(group)??0)+cost));
  };
  purchases.forEach(p=>collect(splitPurchaseCost(p),"Po")); costs.forEach(c=>collect(splitLooseCost(c),"Loose"));
  return {...result,material:round(result.materialPo+result.materialLoose),other:round(result.otherPo+result.otherLoose),own:round(result.ownPo+result.ownLoose)};
}

/** Supplier cost replaces an absent sales-line cost. Never add both for the same goods. */
export function projectOwnProducts(docs: {kind:string;status:string;items:unknown}[], booked: Map<string,number>, productCost?: (item:DocumentLineItem)=>number|undefined) {
  const groups = new Map<string,{revenue:number;cost:number;uncosted:number}>();
  const labels = new Map<string,string>();
  for (const d of docs) {
    if (!["invoice","creditnote"].includes(d.kind) || ["draft","void"].includes(d.status)) continue;
    const sign=d.kind==="creditnote"?-1:1;
    for (const it of normalizeDocItems(d.items)) {
      if (!isOwnProductLine(it,productCost)) continue;
      const key=ownProductGroup(it), group=groups.get(key)??{revenue:0,cost:0,uncosted:0};
      if(!labels.has(key)) labels.set(key,it.name);
      const cost=lineMaterialCostEur(it,productCost), revenue=sign*lineNet(it);
      if(cost!==0) {group.revenue+=revenue;group.cost+=sign*cost;} else group.uncosted+=revenue;
      groups.set(key,group);
    }
  }
  let revenue=0,cost=0,uncosted=0,bookedCost=0;
  const supplierCostGroups = new Map<string,number>();
  /** Per productgroep hoe de geboekte kostprijs is opgebouwd — telt op tot bookedCost. */
  const breakdown: {group:string;label:string|null;revenue:number;lineCost:number;purchase:number;booked:number}[] = [];
  for (const key of new Set([...groups.keys(),...booked.keys()])) {
    const g=groups.get(key)??{revenue:0,cost:0,uncosted:0}, purchase=booked.get(key)??0;
    const lineCost=g.cost, groupRevenue=g.revenue+g.uncosted;
    // A family with no sales-line cost can use its actual booked supplier costs.
    if (g.cost===0 && g.uncosted*purchase>0) {g.revenue+=g.uncosted;g.uncosted=0;g.cost=purchase;supplierCostGroups.set(key,purchase);}
    revenue+=g.revenue;cost+=g.cost;uncosted+=g.uncosted;
    const groupBooked=purchase>0&&g.cost>0?Math.max(purchase,g.cost):purchase!==0?purchase:g.cost;
    bookedCost+=groupBooked;
    breakdown.push({group:key,label:labels.get(key)??null,revenue:round(groupRevenue),lineCost:round(lineCost),purchase:round(purchase),booked:round(groupBooked)});
  }
  breakdown.sort((a,b)=>b.booked-a.booked);
  return {revenue:round(revenue),cost:round(cost),uncosted:round(uncosted),totalRevenue:round(revenue+uncosted),bookedCost:round(bookedCost),supplierCostGroups,breakdown};
}
