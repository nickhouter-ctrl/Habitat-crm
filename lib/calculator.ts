/** Shared, deterministic pricing for the preview and the saved quote. */
import { z } from "zod";

export const CALCULATOR_MARKUP = 15;
export const money = (n: number) => Math.round((n + Number.EPSILON * Math.max(1, Math.abs(n))) * 100) / 100;
const amount = z.number().finite().min(0).max(1_000_000);
export const bathroomSchema = z.object({
  m2: amount.default(8), perimeter: amount.default(0), height: amount.default(2.6), openings: amount.default(2),
  showers: amount.int().max(10).default(1), baths: amount.int().max(10).default(0),
  toilets: amount.int().max(10).default(1), basins: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
  width: amount.max(300).default(60), color: z.string().max(80).default(""),
  furniture: z.enum(["stock","separate"]).default("stock"),
  slotColors: z.record(z.string(),z.string().max(80)).default({}),
  demolish: z.boolean().default(true), wallTiles: z.boolean().default(true), floorTiles: z.boolean().default(true),
  choices: z.record(z.string(), z.string().max(100)).default({}),
});
export const calculatorSchema = z.object({
  version: z.literal(2), color: z.string().max(80).default("CE"), hourlyRate: amount.max(250).default(28),
  contingency: amount.max(30).default(0), bathrooms: z.array(bathroomSchema).max(12).default([]),
  dimensions: z.record(z.string(), amount).default({}),
  quantities: z.record(z.string(), amount).default({}),
  disabled: z.array(z.string()).max(200).default([]),
  productChoices: z.record(z.string(), z.string().max(100)).default({}),
  // Explicit, reviewable estimates; no hidden blanket discount.
  costOverrides: z.record(z.string(), z.object({ hours: amount, material: amount })).default({}),
});
export type CalculatorConfig = z.infer<typeof calculatorSchema>;
export type BathroomConfig = z.infer<typeof bathroomSchema>;
export const emptyConfig = (): CalculatorConfig => calculatorSchema.parse({version:2});
export const newBathroom = (): BathroomConfig => bathroomSchema.parse({});
export type CalcPost = {
  id: string; name: string; chapter: string; unit: string; driver: string; factor: number;
  hours: number | null; material: number | null; cost: number | null; price: number | null;
  waste: number; review: boolean; description: string; productId: string | null;
};
export type CalcProduct = {
  id: string; productId: string; name: string; category: string; code: string; brand: string;
  label: string; options: Record<string,string>; price: number; cost: number | null; unit: string;
};
export type CalcData = { posts: CalcPost[]; products: CalcProduct[] };
export type CalcLine = {
  key: string; name: string; chapter: string; unit: string; quantity: number;
  price: number; cost: number | null; hours: number; materialQuantity: number;
  productId?: string; code?: string; description: string; review: boolean; allowance: boolean;
};
export const CATALOG_POSTS: Record<string,string> = {
  "Wandpanelen": "Wandpanelen", "SPC / PVC vloer": "SPC", "Waterdamphaard": "Haarden",
};
/** Existing cost build-up: XPS/fixing supplies and floor underlay/skirting.
 * These are estimates, editable separately from the catalog product price. */
export function catalogConsumables(post:CalcPost) {
  return post.name==="Wandpanelen"?7:post.name==="SPC / PVC vloer"?4.9:0;
}
export const OLD_BATHROOM_PRODUCTS = ["Inloopdouche compleet", "Bad + badkraan", "Wastafelmeubel, kraan en spiegel", "Hangtoilet incl. accessoires"];
export const COLOR_NAMES: Record<string,string> = {CE:"Chroom",S:"Mat zwart",GK:"Geborsteld koper",NG:"Geborsteld RVS",GM:"Geborsteld gunmetal",GG:"Geborsteld goud",CF:"Coffee"};
export function colorOf(p: CalcProduct): string {
  const code = p.code.match(/(?:^|-)5-([A-Z]{1,2})-/)?.[1] ?? p.code.match(/^5-([A-Z]{1,2})-/)?.[1];
  if (code && COLOR_NAMES[code]) return code;
  const color = (p.options.kleur ?? "").toLowerCase();
  return Object.entries(COLOR_NAMES).find(([key,label]) => key.toLowerCase()===color || label.toLowerCase()===color)?.[0] ?? "";
}
function widthOf(p: CalcProduct) {
  return Number((p.options.breedte ?? p.options.maat ?? "").match(/^(\d+(?:[.,]\d+)?)/)?.[1]?.replace(",",".")) || 0;
}
export type BathSlot = "shower"|"screen"|"drain"|"bath"|"bathTap"|"toilet"|"cabinet"|"basin"|"tap"|"plug"|"siphon"|"mirror";
export const BATH_SLOTS: {key:BathSlot;label:string;count:(b:BathroomConfig)=>number;colored?:boolean}[] = [
  {key:"shower",label:"Inbouwdoucheset",count:b=>b.showers,colored:true},
  {key:"screen",label:"Douchewand",count:b=>b.showers,colored:true},
  {key:"drain",label:"Douchegoot",count:b=>b.showers,colored:true},
  {key:"bath",label:"Vrijstaand bad",count:b=>b.baths},
  {key:"bathTap",label:"Vrijstaande badkraan",count:b=>b.baths,colored:true},
  {key:"toilet",label:"Toilet",count:b=>b.toilets},
  {key:"cabinet",label:"Onderkast",count:b=>b.basins?1:0},
  {key:"basin",label:"Wastafelblad",count:b=>b.basins?1:0},
  {key:"tap",label:"Wastafelkraan",count:b=>b.basins,colored:true},
  {key:"plug",label:"Afvoerplug",count:b=>b.basins,colored:true},
  {key:"siphon",label:"Sifon",count:b=>b.basins,colored:true},
  {key:"mirror",label:"Spiegel",count:b=>b.basins?1:0},
];
export function bathroomCandidates(products:CalcProduct[], slot:BathSlot, b:BathroomConfig, color:string):CalcProduct[] {
  return products.filter(p=>{
    if (slot!=="bath" && p.brand.toUpperCase()!=="BRAUER") return false;
    if (BATH_SLOTS.find(s=>s.key===slot)?.colored && colorOf(p)!==color) return false;
    const name=p.name.toLowerCase();
    if (slot==="shower") return p.category==="Douchesets" && /inbouw.*(?:regen)?douche/.test(name) && !/zonder|luxe|premium|thermostaat met/.test(name);
    if (slot==="screen") return p.category==="Douchewanden" && /^GS-.*I1/.test(p.code) && !/zijwand|deur/.test(name) && (p.options.glastype??p.options.glassoort)==="Helder glas";
    if (slot==="drain") return p.category==="Douchegoten" && !/los |losse|onderdeel/.test(name) && Number((p.options.lengte??p.options.maat??"").match(/(?:^|x)(\d+)\s*cm/)?.[1]??0)>=70;
    if (slot==="bath") return p.category==="Baden";
    if (slot==="bathTap") return p.category==="Badkranen" && /vrijstaand/.test(name) && !/zonder/.test(name);
    if (slot==="toilet") return p.category==="Toiletten";
    if (slot==="cabinet" && b.furniture==="stock") return /^MS-COA[12]/.test(p.code) && widthOf(p)===b.width && (b.basins===2?/-2/.test(p.code):!/-2/.test(p.code));
    if (slot==="cabinet") return /^(?:2x)?OK-/i.test(p.code) && widthOf(p)===b.width;
    if (slot==="basin") return /^WT-/i.test(p.code) && widthOf(p)===b.width && Number((p.options.wasbakken??"").match(/\d+/)?.[0])===b.basins && Number((p.options.kraangat??"").match(/\d+/)?.[0])===b.basins;
    if (slot==="tap") return p.category==="Wastafelkranen" && !/inbouw|verhoogd|hoog model|zonder/.test(name);
    if (slot==="plug") return /klik.*waste|click.*waste|klik.*plug/.test(name);
    if (slot==="siphon") return /sifon/.test(name) && !/onderdeel/.test(name);
    if (slot==="mirror") return p.category==="Spiegels" && widthOf(p)===b.width && !/rond|ovaal/.test((p.options.vorm??"").toLowerCase());
    return false;
  });
}
/** A real product closest to the mean; never invent a SKU or price. */
export function representative(candidates:CalcProduct[]) {
  if (!candidates.length) return undefined;
  const mean=candidates.reduce((s,p)=>s+p.price,0)/candidates.length;
  return [...candidates].sort((a,b)=>Math.abs(a.price-mean)-Math.abs(b.price-mean)||a.id.localeCompare(b.id))[0];
}
export function wallArea(b:BathroomConfig) {
  return money(Math.max(0,(b.perimeter || 4*Math.sqrt(b.m2))*b.height-b.openings));
}
export function postQuantity(post:CalcPost, config:CalculatorConfig):number {
  if(config.disabled.includes(post.id)) return 0;
  if(config.quantities[post.id]!=null) return config.quantities[post.id];
  const bs=config.bathrooms;
  const sum=(f:(b:BathroomConfig)=>number)=>bs.reduce((s,b)=>s+f(b),0);
  const d=config.dimensions;
  const derived:Record<string,number>={
    badkamers:bs.length,badkamer_m2:sum(b=>b.m2),douches:sum(b=>b.showers),baden:sum(b=>b.baths),
    wastafels:sum(b=>b.basins),toiletten:sum(b=>b.toilets),
    sloop_totaal_m2:(d.sloop_wanden_m2??0)+(d.sloop_vloer_m2??0)+sum(b=>b.demolish?b.m2:0),
  };
  if(post.name==="Wandtegels badkamer") return sum(b=>b.wallTiles?wallArea(b):0);
  if(post.name==="Vloertegels badkamer") return sum(b=>b.floorTiles?b.m2:0);
  if(post.name==="Badkamer strippen") return sum(b=>b.demolish?b.m2:0);
  const independent:Record<string,string>={"Vloer verwijderen":"sloop_vloer_m2","Hoofdbekabeling vernieuwen":"bekabeling_m2","Schilderwerk binnen":"schilder_binnen_m2","Schilderwerk buiten / gevel":"schilder_buiten_m2","Afwerkvloer / dekvloer":"dekvloer_m2","Irrigatiesysteem tuin":"irrigatie_m2"};
  return money((derived[post.driver]??d[independent[post.name]??post.driver]??0)*post.factor);
}
export function catalogCandidates(products:CalcProduct[], post:CalcPost) {
  return products.filter(p=> p.productId===post.productId || (!p.brand && (
    post.name==="Wandpanelen" && /wandpane|magic stone|marble|wood panel/i.test(p.category+" "+p.name) && p.unit==="m²" ||
    post.name==="SPC / PVC vloer" && /spc|pvc/i.test(p.category+" "+p.name) && p.unit==="m²" ||
    post.name==="Waterdamphaard" && /haard|fireplace/i.test(p.category+" "+p.name)
  )));
}
export function pricePost(post:CalcPost, quantity:number, config:CalculatorConfig, products:CalcProduct[]):CalcLine | null {
  if(quantity<=0) return null;
  const override=config.costOverrides[post.id];
  const hours=override?.hours??post.hours??0;
  const material=override?.material??post.material;
  const materialQuantity=money(quantity*(1+post.waste/100));
  const catalog=!!post.productId || post.name in CATALOG_POSTS;
  const candidates=catalog?catalogCandidates(products,post):[];
  const selected=config.productChoices[post.id];
  const product=selected?candidates.find(p=>p.id===selected):representative(candidates);
  const labor=hours*config.hourlyRate;
  const extras=catalog?(override?.material??catalogConsumables(post))*(1+post.waste/100):0;
  // For catalog items, use the actual selling price, never reverse an old blended margin.
  if(catalog && !product) return null;
  const cost=catalog
    ? product!.cost==null?null:money(labor+extras+(product!.cost*(1+post.waste/100)))
    : material!=null?money(labor+material*(1+post.waste/100)):post.cost;
  if(!catalog && cost==null) return null;
  const price=catalog?money((labor+extras)*1.15+product!.price*(1+post.waste/100)):money(cost!*1.15);
  return {key:post.id,name:post.name,chapter:post.chapter,quantity,unit:post.unit,price,cost,hours:money(quantity*hours),materialQuantity,
    review:post.review,allowance:catalog,code:product?.code,
    description:catalog?`${product!.name} · ${product!.label}. Materiaal tegen catalogusverkoopprijs; montage apart berekend. Stelpost, definitieve keuze te verrekenen.`
    :`${post.name}, volgens de opgegeven hoeveelheid.${post.waste?` Inclusief ${post.waste}% materiaalverlies; plaatsing over netto ${post.unit}.`:""}`};
}
export function calculate(config:CalculatorConfig,data:CalcData) {
  const lines:CalcLine[]=[]; const errors:string[]=[]; const warnings:string[]=[];
  for(const p of data.posts) {
    if(OLD_BATHROOM_PRODUCTS.includes(p.name)) continue;
    const qty=postQuantity(p,config);
    const line=pricePost(p,qty,config,data.products);
    if(qty>0&&!line) errors.push(`${p.name}: geen passende catalogusprijs of kostprijs. Kies een product of vul een kostopbouw in.`);
    if(line) {
      if((p.productId || p.name in CATALOG_POSTS)&&line.hours>0) {
        const laborPerUnit=(config.costOverrides[p.id]?.hours??p.hours??0)*config.hourlyRate
          +(config.costOverrides[p.id]?.material??catalogConsumables(p))*(1+p.waste/100);
        const laborSale=money(laborPerUnit*1.15);
        lines.push({...line,key:`${p.id}-montage`,name:`${p.name} · montage en verbruiksmateriaal`,price:laborSale,cost:money(laborPerUnit),allowance:false,materialQuantity:0,description:`Montage ${p.name.toLowerCase()}, over de netto hoeveelheid, inclusief begroot verbruiksmateriaal.`});
        lines.push({...line,price:money(line.price-laborSale),cost:line.cost==null?null:money(line.cost-laborPerUnit),hours:0,
          description:line.description.replace("; montage apart berekend.",".")});
      } else lines.push(line);
    }
  }
  config.bathrooms.forEach((b,i)=>{
    if(b.wallTiles&&b.m2&&!b.perimeter) warnings.push(`Badkamer ${i+1}: wandoppervlak geschat als vierkante ruimte; controleer de omtrek.`);
    for(const slot of BATH_SLOTS) {
      if(slot.key==="basin"&&b.furniture==="stock") continue;
      const qty=slot.count(b); if(!qty) continue;
      const color=b.slotColors[slot.key]||b.color||config.color;
      const candidates=bathroomCandidates(data.products,slot.key,b,color);
      const choice=b.choices[slot.key];
      // Explicit product overrides can differ in color/size, but must remain the same component type.
      const chosen=choice?data.products.find(p=>p.id===choice):representative(candidates);
      if(!chosen || choice && !bathroomCandidates([chosen],slot.key,{...b,width:widthOf(chosen)||b.width},colorOf(chosen)||color).length) {
        errors.push(`Badkamer ${i+1} · ${slot.label}: geen passende uitvoering${slot.colored?` in ${COLOR_NAMES[color]??color}`:""}.`);continue;
      }
      lines.push({key:`bath-${i}-${slot.key}`,chapter:"Badkamers & sanitair",name:`Badkamer ${i+1} · ${slot.key==="cabinet"&&b.furniture==="stock"?"Complete Core-meubelset (kast + wastafel)":slot.label}`,quantity:qty,unit:"stuk",
        price:money(chosen.price),cost:chosen.cost,hours:0,materialQuantity:qty,code:chosen.code,
        // A provisional selection is a price allowance, not a stock reservation.
        description:`Stelpost: ${chosen.name} · ${chosen.label}${chosen.code?` · ${chosen.code}`:""}. Definitieve keuze wordt als meer- of minderprijs verrekend.`,
        review:false,allowance:true});
    }
  });
  const subtotal=money(lines.reduce((s,l)=>s+money(l.quantity*l.price),0));
  const contingency=money(subtotal*config.contingency/100);
  const cost=money(lines.reduce((s,l)=>s+(l.cost==null?0:money(l.quantity*l.cost)),0));
  const unknownCost=lines.some(l=>l.cost==null);
  return {lines,errors,warnings,subtotal,contingency,total:money(subtotal+contingency),cost,unknownCost,
    earnings:unknownCost?null:money(subtotal-cost),hours:money(lines.reduce((s,l)=>s+l.hours,0))};
}
