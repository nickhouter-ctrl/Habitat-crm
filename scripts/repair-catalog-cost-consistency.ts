/** Dry-run by default. --apply requires --backup=/absolute/private/path.json.
 * Fills missing variant costs from exact Caracole SKU matches or an exact panel
 * dimension match. Aligns a panel's base cost with its unique canonical size.
 * Never derives costs from sale prices or substitutes a different colour/size.
 */
import "./load-env";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { repairCatalogCosts } from "../lib/catalog-cost-repair";

async function main() {
  const apply = process.argv.includes("--apply");
  const backup = process.argv.find(a => a.startsWith("--backup="))?.slice(9);
  const csv = process.argv.find(a => a.startsWith("--csv="))?.slice(6);
  if (!csv || (apply && (!backup || !isAbsolute(backup)))) throw new Error("Supply --csv=source.csv and an absolute --backup=path for --apply");
  const wb = XLSX.read(readFileSync(csv), { type: "buffer" });
  const source = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[wb.SheetNames[0]]);
  const costs = new Map<string, number>();
  for (const row of source) {
    const sku = String(row["Product variant SKU"] ?? "").trim();
    const cost = Number(row["Product variant price"]);
    if (!sku || !(cost > 0) || !Number.isFinite(cost)) continue;
    if (costs.has(sku) && costs.get(sku) !== cost) throw new Error(`Conflicting source cost for ${sku}`);
    costs.set(sku, cost);
  }
  await db.transaction(async tx => {
    const rows = await tx.select().from(products).where(eq(products.isActive, true)).for("update");
    const changes = rows.flatMap(p => {
      const result = repairCatalogCosts(p, costs);
      return result.reasons.length ? [{ before: p, ...result }] : [];
    });
    console.log(JSON.stringify({ apply, products: changes.length, reasons: changes.reduce<Record<string, number>>((acc, c) => {
      for (const reason of c.reasons) acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {}) }, null, 2));
    if (!apply) return;
    // Backup is written before any mutation; exclusive creation prevents overwriting prior evidence.
    writeFileSync(backup!, JSON.stringify(changes, null, 2), { mode: 0o600, flag: "wx" });
    for (const c of changes) await tx.update(products).set({ ...c.set, updatedAt: new Date() }).where(eq(products.id, c.before.id));
  });
}
main().then(() => process.exit(0)).catch(e => { console.error(e instanceof Error ? e.message : "Repair failed"); process.exit(1); });
