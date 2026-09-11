import { describe, expect, it } from "vitest";
import { confirmedCalculatorRate } from "../calculator-rates";
import { calculate, emptyConfig, newBathroom, postQuantity, pricePost, bathroomCandidates, type CalcPost, type CalcProduct } from "../calculator";
const post:CalcPost={id:"tiles",name:"Vloertegels leggen",chapter:"Tegelwerk",unit:"m²",driver:"tegelvloer_m2",factor:1,hours:1,material:30,cost:58,price:100,waste:10,review:false,description:"",productId:null};
const product:CalcProduct={id:"p",productId:"parent",name:"Core set",category:"Badkamermeubels",code:"MS-COA160HO",brand:"BRAUER",label:"60 cm",options:{breedte:"60 cm",kleur:"Honey"},price:700,cost:350,unit:"stuk"};
describe("offerte-configurator",()=>{
  it("uses the confirmed all-in monocapa cost without adding old labor or waste",()=>{
    const rate=confirmedCalculatorRate({...post,name:"Stucwerk buiten / gevel",hours:0.8,material:10,waste:10});
    const line=pricePost(rate,100,{...emptyConfig(),hourlyRate:50},[])!;
    expect(line.cost).toBe(27.5);expect(line.price).toBe(31.63);
    expect(line.hours).toBe(0);expect(line.materialQuantity).toBe(100);
    expect(rate.review).toBe(false);
  });
  it("charges waste on material only, and 15% markup on construction cost",()=>{
    const line=pricePost(post,100,emptyConfig(),[])!;
    expect(line.hours).toBe(100);expect(line.materialQuantity).toBe(110);
    expect(line.cost).toBe(61);expect(line.price).toBe(70.15);
  });
  it("does not infer demolition or painting from dwelling/plaster area",()=>{
    const c={...emptyConfig(),dimensions:{woonoppervlak_m2:100,stuc_binnen_m2:200}};
    expect(postQuantity({...post,name:"Vloer verwijderen",driver:"woonoppervlak_m2"},c)).toBe(0);
    expect(postQuantity({...post,name:"Schilderwerk binnen",driver:"stuc_binnen_m2"},c)).toBe(0);
  });
  it("uses measured wall perimeter and excludes openings",()=>{
    const c={...emptyConfig(),bathrooms:[{...newBathroom(),m2:8,perimeter:12,height:2.5,openings:2}]};
    expect(postQuantity({...post,name:"Wandtegels badkamer",factor:5},c)).toBe(28);
    expect(postQuantity({...post,name:"Wandtegels badkamer"},{...c,quantities:{tiles:0}})).toBe(0);
  });
  it("selects a complete 60cm Core set; excludes loose cabinets",()=>{
    const candidates=bathroomCandidates([product,{...product,id:"loose",code:"OK-CO60HO"}],"cabinet",newBathroom(),"CE");
    expect(candidates.map(p=>p.id)).toEqual(["p"]);
  });
  it("uses catalog selling price without another markup",()=>{
    const c={...emptyConfig(),bathrooms:[{...newBathroom(),showers:0,toilets:0}]};
    const r=calculate(c,{posts:[],products:[product]});
    const cabinet=r.lines.find(l=>l.key.endsWith("cabinet"))!;
    expect(cabinet.price).toBe(700);expect(cabinet.quantity).toBe(1);
    expect(r.lines.some(l=>l.key.endsWith("basin"))).toBe(false);
    expect(r.errors.some(e=>e.includes("Wastafelblad"))).toBe(false);
  });
  it("never silently substitutes a different tap color",()=>{
    const tap={...product,category:"Wastafelkranen",name:"Wastafelkraan",code:"5-GG-001",options:{kleur:"Geborsteld goud"}};
    expect(bathroomCandidates([tap],"tap",newBathroom(),"CE")).toEqual([]);
    expect(bathroomCandidates([tap],"tap",newBathroom(),"GG")).toHaveLength(1);
  });
  it("reports missing prices instead of dropping selected work",()=>{
    const r=calculate({...emptyConfig(),quantities:{tiles:1}},{posts:[{...post,hours:null,material:null,cost:null}],products:[]});
    expect(r.errors).toHaveLength(1);expect(r.lines).toHaveLength(0);
  });
});
