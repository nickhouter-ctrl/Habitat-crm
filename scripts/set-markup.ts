import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
const APPLY = process.argv.includes("--apply");
const r2 = (n:number)=>Math.round(n*100)/100;
async function main(){
  const all = await db.select({id:products.id,name:products.name,sku:products.sku,costEur:products.costEur,priceEur:products.priceEur,targetMarginPct:products.targetMarginPct}).from(products);
  let n=0;
  const ups:{id:string;sku:string;name:string;old:string|null;markup:number}[]=[];
  for (const p of all){
    const c=Number(p.costEur??0), pr=Number(p.priceEur??0);
    if (!(c>0)||!(pr>0)) continue;
    const markup=r2((pr-c)/c*100);
    if (String(markup)!==String(Number(p.targetMarginPct??0))){ ups.push({id:p.id,sku:p.sku??"—",name:p.name,old:p.targetMarginPct,markup}); n++; }
  }
  console.log(`Markup (winst t.o.v. kostprijs) bijwerken voor ${n} producten:`);
  for (const u of ups.slice(0,40)) console.log(`  ${u.sku} ${u.name}: ${u.old??"—"}% → ${u.markup}%`);
  if (ups.length>40) console.log(`  ... +${ups.length-40} meer`);
  if (!APPLY){console.log("\n(dry run)");process.exit(0);}
  for (const u of ups) await db.update(products).set({targetMarginPct:String(u.markup),updatedAt:new Date()}).where(eq(products.id,u.id));
  console.log(`\nBijgewerkt: ${ups.length}`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
