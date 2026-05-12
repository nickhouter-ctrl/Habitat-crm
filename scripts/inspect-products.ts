import "./load-env";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
async function main() {
  const rows = await db.select({
    id: products.id, name: products.name, sku: products.sku, collection: products.collection,
    description: products.description, costEur: products.costEur, purchaseCostEur: products.purchaseCostEur,
    priceEur: products.priceEur, holdedProductId: products.holdedProductId, isActive: products.isActive,
  }).from(products);
  console.log("TOTAL", rows.length);
  const noHolded = rows.filter(r => !r.holdedProductId);
  console.log("\n=== NO holdedProductId (", noHolded.length, ") ===");
  for (const r of noHolded) console.log(r.sku ?? "—", "|", r.name, "|", r.collection, "| cost", r.costEur);
  const colls = new Map<string, number>();
  for (const r of rows) colls.set(r.collection ?? "(null)", (colls.get(r.collection ?? "(null)")??0)+1);
  console.log("\n=== collections ===", Object.fromEntries(colls));
  // Magic Stone-ish: sku starts MS-
  const ms = rows.filter(r => (r.sku ?? "").toUpperCase().startsWith("MS-"));
  console.log("\n=== MS- products (", ms.length, ") — sku | name | dims(desc) | costEur | purchaseCostEur ===");
  for (const r of ms.sort((a,b)=>(a.sku??"").localeCompare(b.sku??""))) console.log(r.sku, "|", r.name, "|", (r.description??"").replace(/\s+/g," ").trim(), "|", r.costEur ?? "—", "|", r.purchaseCostEur ?? "—");
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
