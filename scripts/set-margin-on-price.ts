import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
const APPLY = process.argv.includes("--apply");
const r2 = (n:number)=>Math.round(n*100)/100;
(async()=>{
  const all = await db.select({id:products.id,name:products.name,sku:products.sku,costEur:products.costEur,priceEur:products.priceEur,targetMarginPct:products.targetMarginPct}).from(products);
  const ups:{id:string;sku:string;old:string|null;m:number}[]=[];
  for(const p of all){ const c=Number(p.costEur??0),pr=Number(p.priceEur??0); if(!(c>0)||!(pr>0))continue; const m=r2((pr-c)/pr*100); if(String(m)!==String(Number(p.targetMarginPct??0))) ups.push({id:p.id,sku:p.sku??"—",old:p.targetMarginPct,m}); }
  console.log(`Marge (op verkoopprijs) bijwerken voor ${ups.length} producten:`);
  for(const u of ups.slice(0,15)) console.log(`  ${u.sku}: ${u.old??"—"}% → ${u.m}%`);
  if(ups.length>15) console.log(`  ... +${ups.length-15}`);
  if(!APPLY){console.log("(dry run)");process.exit(0);}
  for(const u of ups) await db.update(products).set({targetMarginPct:String(u.m),updatedAt:new Date()}).where(eq(products.id,u.id));
  console.log(`Bijgewerkt: ${ups.length}`); process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
