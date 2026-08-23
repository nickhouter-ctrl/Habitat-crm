/**
 * Herstel Caracole-verkoopprijzen (23-08-2026).
 *
 * Bij de import is de leveranciers-INKOOPprijs (excl. btw) als verkoopprijs
 * opgeslagen. De catalogus-CSV bevat twee prijzen per variant:
 *   - "Product variant price"            = inkoopprijs, excl. btw
 *   - "Product variant compare at price" = adviesverkoopprijs, INCL. btw
 *
 * Dit script zet per SKU:
 *   - price_eur / trade_price_eur → adviesprijs ÷ (1 + btw%), op 4 decimalen
 *     zodat er incl. btw weer exact de adviesprijs uitrolt
 *   - purchase_cost_eur           → de inkoopprijs uit de CSV
 *   - cost_eur                    → idem (landed cost; geen aparte vracht bekend)
 *   - target_margin_pct           → werkelijke marge = (verkoop − kost) / verkoop
 *
 * Idempotent: rijen die al goed staan worden overgeslagen.
 * Dry-run: `npx tsx scripts/fix-caracole-adviesprijzen.ts --dry`
 */
import "./load-env";
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const CSV_PATH = process.env.CARACOLE_CSV ?? "full-catalogue-20262239304 (1).csv";
const DRY = process.argv.includes("--dry");

/** Kale CSV-parser (velden met komma's staan tussen dubbele quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, "utf8").replace(/^﻿/, "");
  const [header, ...rows] = parseCsv(raw);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`kolom ontbreekt: ${name}`);
    return i;
  };
  const iSku = col("Product variant SKU");
  const iPrice = col("Product variant price");
  const iCompare = col("Product variant compare at price");
  const iTitle = col("Product title");

  // SKU → { inkoop (excl.), advies (incl.) } — CSV herhaalt elke variant per collectie.
  const bySku = new Map<string, { inkoop: number; advies: number; titel: string }>();
  const skipped: string[] = [];
  for (const r of rows) {
    const sku = (r[iSku] ?? "").trim();
    if (!sku) continue;
    const inkoop = Number.parseFloat((r[iPrice] ?? "").trim());
    const advies = Number.parseFloat((r[iCompare] ?? "").trim());
    if (!Number.isFinite(inkoop) || !Number.isFinite(advies)) {
      if (!bySku.has(sku)) skipped.push(sku);
      continue;
    }
    const prev = bySku.get(sku);
    if (prev && (prev.inkoop !== inkoop || prev.advies !== advies)) {
      throw new Error(`SKU ${sku} heeft tegenstrijdige prijzen in de CSV`);
    }
    bySku.set(sku, { inkoop, advies, titel: (r[iTitle] ?? "").trim() });
  }
  console.log(`CSV: ${bySku.size} unieke SKUs met beide prijzen, ${skipped.length} zonder adviesprijs${skipped.length ? ` (${skipped.join(", ")})` : ""}`);

  const dbRows = await db.execute(sql`
    select id, sku, name, vat_rate,
           price_eur::numeric as price_eur,
           trade_price_eur::numeric as trade_price_eur,
           purchase_cost_eur::numeric as purchase_cost_eur,
           cost_eur::numeric as cost_eur,
           target_margin_pct::numeric as target_margin_pct
    from products where collection = 'Caracole'`);
  const items = (dbRows.rows ?? dbRows) as Array<{
    id: string; sku: string | null; name: string; vat_rate: number;
    price_eur: string | null; trade_price_eur: string | null; purchase_cost_eur: string | null;
    cost_eur: string | null; target_margin_pct: string | null;
  }>;
  console.log(`DB: ${items.length} Caracole-producten`);

  let updated = 0, alreadyOk = 0, mismatch = 0;
  const notInCsv: string[] = [];
  for (const p of items) {
    const sku = (p.sku ?? "").trim();
    const entry = sku ? bySku.get(sku) : undefined;
    if (!entry) { notInCsv.push(sku || `(geen sku: ${p.name})`); continue; }

    const btw = 1 + (p.vat_rate ?? 21) / 100;
    const exclNum = Math.round((entry.advies / btw) * 10000) / 10000;
    const excl = exclNum.toFixed(4);
    const inkoop = entry.inkoop.toFixed(2);
    // Marge als % van de verkoopprijs (excl. btw), zelfde definitie als het productoverzicht.
    const marge = (Math.round(((exclNum - entry.inkoop) / exclNum) * 10000) / 100).toFixed(2);

    const curPrice = p.price_eur ? Number.parseFloat(p.price_eur) : null;
    if (
      curPrice !== null &&
      Math.abs(curPrice - entry.inkoop) > 0.005 &&
      Math.abs(curPrice - Number.parseFloat(excl)) > 0.005
    ) {
      // prijs is noch de foute inkoopprijs noch al de adviesprijs → niet blind overschrijven
      console.log(`  ⚠️  ${sku}: DB-prijs ${curPrice} ≠ inkoop ${entry.inkoop} én ≠ advies-excl ${excl} — overgeslagen (${p.name})`);
      mismatch++;
      continue;
    }
    if (
      curPrice !== null && Math.abs(curPrice - exclNum) <= 0.005 &&
      p.purchase_cost_eur !== null && Math.abs(Number.parseFloat(p.purchase_cost_eur) - entry.inkoop) <= 0.005 &&
      p.cost_eur !== null && Math.abs(Number.parseFloat(p.cost_eur) - entry.inkoop) <= 0.005 &&
      p.target_margin_pct !== null && Math.abs(Number.parseFloat(p.target_margin_pct) - Number.parseFloat(marge)) <= 0.005
    ) { alreadyOk++; continue; }

    if (!DRY) {
      await db.execute(sql`
        update products
        set price_eur = ${excl}::numeric,
            trade_price_eur = ${excl}::numeric,
            purchase_cost_eur = ${inkoop}::numeric,
            cost_eur = ${inkoop}::numeric,
            target_margin_pct = ${marge}::numeric,
            updated_at = now()
        where id = ${p.id}::uuid`);
    }
    updated++;
  }

  console.log(`\n${DRY ? "[DRY-RUN] zou bijwerken" : "bijgewerkt"}: ${updated}, stond al goed: ${alreadyOk}, afwijkend/overgeslagen: ${mismatch}`);
  if (notInCsv.length) {
    console.log(`niet in CSV gevonden (${notInCsv.length}): ${notInCsv.slice(0, 30).join(", ")}${notInCsv.length > 30 ? " …" : ""}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
