import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { priceBookItems } from "@/lib/db/schema";
import type { CalcData, CalcProduct } from "@/lib/calculator";
import { confirmedCalculatorRate } from "@/lib/calculator-rates";

/** Reading the calculator never rewrites prices or synchronizes the catalog. */
export async function loadCalculatorData():Promise<CalcData> {
  const [posts,products]=await Promise.all([
    db.select().from(priceBookItems).where(eq(priceBookItems.active,true)).orderBy(asc(priceBookItems.sortOrder)),
    db.execute<{
      id:string;productId:string;name:string;category:string;code:string;brand:string;label:string;
      options:Record<string,string>|null;price:string;cost:string|null;unit:string;collection:string|null;width:string|null;height:string|null;length:string|null;
    }>(sql`select coalesce(v.id,p.id) id,p.id "productId",p.name,coalesce(p.category,'') category,
      coalesce(v.code,p.sku,'') code,coalesce(b.name,'') brand,coalesce(v.label,'') label,v.options,
      coalesce(v.price_eur,p.price_eur)::text price,coalesce(v.cost_eur,p.cost_eur)::text cost,coalesce(p.unit,'stuk') unit,
      p.collection,p.width_mm::text width,p.height_mm::text height,p.length_mm::text length
      from products p left join brands b on b.id=p.brand_id
      left join product_variants v on v.product_id=p.id and v.is_active
      where (b.name ilike 'brauer' or p.brand_id is null)
      and coalesce(v.price_eur,p.price_eur)>0`),
  ]);
  return {
    posts:posts.map(p=>({id:p.id,name:p.name,chapter:p.name==="Waterdamphaard"?"Overige":p.chapter,unit:p.unit,driver:p.driver,factor:Number(p.factor),
      hours:p.laborHours==null?null:Number(p.laborHours),material:p.materialCostEur==null?null:Number(p.materialCostEur),
      cost:p.costEur==null?null:Number(p.costEur),price:p.priceEur==null?null:Number(p.priceEur),waste:Number(p.wastePct),
      review:p.needsReview,description:p.description??"",productId:p.productId})).map(confirmedCalculatorRate),
    products:products.map((p):CalcProduct=>{
      const area=Number(p.width)*Number(p.height||p.length)/1_000_000;
      const panel=!p.brand && /wandpanel/i.test(p.collection??"") && p.unit!=="m²" && area>0;
      return {id:p.id,productId:p.productId,name:p.name,category:panel?"Wandpanelen":p.category,code:p.code,brand:p.brand,label:p.label,
        options:p.options??{},unit:panel?"m²":p.unit,price:Number(p.price)/(panel?area:1),cost:p.cost==null?null:Number(p.cost)/(panel?area:1)};
    }),
  };
}
