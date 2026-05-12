/**
 * Import the GS1-assigned EAN-13 barcodes (and product images) from the
 * "activate_products" export — sheet "Importación con GTIN", columns
 * referencia_interna (= SKU) and gtin_unidad (= barcode).
 *
 *   npx tsx scripts/import-barcodes.ts          (dry run)
 *   npx tsx scripts/import-barcodes.ts --apply
 */
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";

import "./load-env";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { isValidEan13 } from "../lib/barcode";

const APPLY = process.argv.includes("--apply");
const FILE = path.join(os.homedir(), "Downloads", "activate_products_20260512133845.xlsx");
function normSku(s: unknown){return String(s??"").toUpperCase().replace(/[\s._/]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").trim();}

async function main(){
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets["Importación con GTIN"] ?? wb.Sheets[wb.SheetNames.find(n=>/GTIN/i.test(n))!];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  // col 0 = referencia_interna, col 1 = gtin_unidad, col 2 = url_imagen_unidad
  const bySku = new Map<string,{gtin:string;img?:string;name:string}>();
  for (const r of rows) {
    const sku = normSku(r[0]);
    const gtin = String(r[1]??"").trim().replace(/\D/g,"");
    const img = String(r[2]??"").trim();
    const name = `${r[4]??""} ${r[6]??""} ${r[8]??""}`.replace(/\s+/g," ").trim();
    if (!sku || sku === "A-123" || !/^\d{13}$/.test(gtin)) continue;
    if (!isValidEan13(gtin)) { console.warn(`! ${sku}: ongeldige EAN-13 check digit (${gtin}) — overgeslagen`); continue; }
    bySku.set(sku, { gtin, img: img.startsWith("http") ? img : undefined, name });
  }
  console.log(`Barcodes uit Excel: ${bySku.size}\n`);

  const all = await db.select({ id: products.id, name: products.name, sku: products.sku, barcode: products.barcode, imageUrl: products.imageUrl }).from(products);
  let set=0, changed=0, sameAlready=0, addImg=0;
  const unmatchedExcel = new Set(bySku.keys());
  const updates: {id:string;barcode:string;img?:string;sku:string;name:string;old:string|null}[] = [];
  for (const p of all) {
    const rec = bySku.get(normSku(p.sku));
    if (!rec) continue;
    unmatchedExcel.delete(normSku(p.sku));
    const needImg = !p.imageUrl && rec.img;
    if (p.barcode === rec.gtin && !needImg) { sameAlready++; continue; }
    if (p.barcode === rec.gtin) sameAlready++; else if (p.barcode) changed++; else set++;
    if (needImg) addImg++;
    updates.push({ id: p.id, barcode: rec.gtin, img: needImg ? rec.img : undefined, sku: p.sku!, name: p.name, old: p.barcode });
  }
  console.log(`Te updaten: ${updates.length}  (nieuw: ${set}, gewijzigd: ${changed}, +afbeelding: ${addImg})`);
  for (const u of updates) console.log(`  ${u.sku}  ${u.name}: barcode ${u.old ?? "—"} → ${u.barcode}${u.img?"  +img":""}`);
  console.log(`\nIn Excel maar geen CRM-product met die SKU (${unmatchedExcel.size}): ${[...unmatchedExcel].join(", ")}`);

  if (!APPLY) { console.log("\n(dry run — --apply om door te voeren)"); process.exit(0); }
  for (const u of updates) await db.update(products).set({ barcode: u.barcode, ...(u.img?{imageUrl:u.img}:{}), updatedAt: new Date() }).where(eq(products.id, u.id));
  console.log(`\nBijgewerkt: ${updates.length} producten.`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
