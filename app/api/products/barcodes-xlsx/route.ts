/**
 * Exporteer producten met barcode als ingevuld MijnGS1 import-template (Excel).
 *
 * Template-structuur ("Importación con GTIN" sheet):
 *   - rij 1-4 = headers/uitleg (NIET aanpassen)
 *   - rij 5 = voorbeeld-regel (NIET aanpassen volgens GS1)
 *   - rij 6+ = onze producten
 *
 * Query params:
 *   ?since=YYYY-MM-DD  → alleen producten met barcode geüpdate na deze datum
 *   ?onlyMissing=1     → alleen items waarvoor we vermoeden dat ze nog niet
 *                        zijn aangemeld bij GS1 (placeholder, niet actief)
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { and, gte, isNotNull, like, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { auth } from "@/auth";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { localizeEthick } from "@/lib/ethick-i18n";
import { resolveGpc } from "@/lib/gs1/gpc-map";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// MijnGS1/AECOC: het "nombre funcional" (nombre1) mag max. 35 tekens zijn en moet
// uniek zijn per product. Onze volledige productnamen zijn vaak langer; we korten
// ze gericht in (afkortingen → woordgrens-truncatie) en maken ze daarna uniek.
const GS1_NAME_MAX = 35;
const NAME_ABBR: [RegExp, string][] = [
  [/\bRammed Earth Board\b/gi, "RE Board"],
  [/\bRammed Earth\b/gi, "RE"],
  [/\bStainless Steel\b/gi, "SS"],
  [/\bbrushed bronze\b/gi, "br. bronze"],
  [/\bInterior Door Set\b/gi, "Int. Door Set"],
  [/\bExterior Door Set\b/gi, "Ext. Door Set"],
  [/\bTravertine\b/gi, "Travert."],
  [/\bController\b/gi, "Ctrl"],
  [/\bBoard\b/gi, "Bd"],
  [/\s*[—-]\s*/g, " - "],
  [/\s+/g, " "],
];

function gs1FunctionalName(name: string, used: Set<string>): string {
  let s = name.trim();
  if (s.length > GS1_NAME_MAX) {
    for (const [re, rep] of NAME_ABBR) {
      if (s.length <= GS1_NAME_MAX) break;
      s = s.replace(re, rep);
    }
  }
  if (s.length > GS1_NAME_MAX) {
    // Tot op de laatste hele woordgrens binnen de limiet inkorten.
    const cut = s.slice(0, GS1_NAME_MAX);
    const sp = cut.lastIndexOf(" ");
    s = (sp > 20 ? cut.slice(0, sp) : cut).trim();
  }
  // Uniek maken: bij botsing (door inkorten) een korte teller toevoegen.
  let out = s;
  let n = 2;
  while (used.has(out.toLowerCase())) {
    const suffix = ` ${n}`;
    const base = s.length + suffix.length > GS1_NAME_MAX ? s.slice(0, GS1_NAME_MAX - suffix.length).trim() : s;
    out = base + suffix;
    n++;
  }
  used.add(out.toLowerCase());
  return out;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const since = url.searchParams.get("since");

  const conditions = [isNotNull(products.barcode)];
  // Alleen onze EIGEN GS1-GTIN's exporteren. Vreemde fabrikant-barcodes (bv.
  // Prosperplast `5905197…` op de bloempotten) kunnen niet onder ons eigen
  // GS1-account geregistreerd worden en laten AECOC de hele import afkeuren.
  const ownPrefix = (process.env.GS1_COMPANY_PREFIX ?? "8436633").replace(/\D/g, "");
  conditions.push(like(products.barcode, `${ownPrefix}%`));
  if (since) conditions.push(gte(products.updatedAt, new Date(since)));

  const rows = await db
    .select({
      barcode: products.barcode,
      sku: products.sku,
      name: products.name,
      description: products.description,
      category: products.category,
      collection: products.collection,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(products.barcode);

  // Lees template
  const templatePath = join(process.cwd(), "lib", "gs1", "template.xlsx");
  const buf = await readFile(templatePath);
  // cellStyles+bookVBA behoudt kolombreedtes, kleurmarkeringen en data-validatie
  // dropdowns van het oorspronkelijke GS1-template.
  const wb = XLSX.read(buf, { type: "buffer", cellStyles: true, bookVBA: true });

  const sheetName = "Importación con GTIN";
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet ${sheetName} niet gevonden in template`);

  // Vanaf rij index 5 (= line 6) onze producten invullen.
  // Kolommen volgens rij index 2 (slugs):
  //   A=referencia_interna, B=gtin_unidad, C=url_imagen_unidad,
  //   D=idioma1, E=marca1, F=submarca1, G=nombre1, H=talla1, I=color1, J=variante1,
  //   K=idioma2, L=marca2, M=submarca2, N=nombre2, O=talla2, P=color2, Q=variante2,
  //   AM=pais1, AN=pais2, ...
  //   AR=gpc, AS=contenido_neto, AT=unidad_contenido_neto, AU=tipo_peso,
  //   AV=url_website_producto, ... AY=gtin_multipack, AZ=unidades_multipack
  // (zie tab "Importación con GTIN" rij 3)
  const exportable = rows;

  const startRow = 5;
  const usedNames = new Set<string>();
  for (let i = 0; i < exportable.length; i++) {
    const r = exportable[i];
    const rowIdx = startRow + i;
    const gpc = resolveGpc(r.collection, r.category);

    const writeCell = (col: number, value: string | number) => {
      const ref = XLSX.utils.encode_cell({ r: rowIdx, c: col });
      ws[ref] = { t: typeof value === "number" ? "n" : "s", v: value };
    };

    writeCell(0, r.sku ?? "");                    // referencia_interna
    writeCell(1, r.barcode ?? "");                // gtin_unidad
    writeCell(2, r.imageUrl ?? "");               // url_imagen_unidad
    writeCell(3, "Inglés");                       // idioma1 — productnamen staan in EN
    writeCell(4, COMPANY.name);                   // marca1
    // submarca1 leeg
    // nombre1 in het Engels (idioma1 = Inglés). ETHICK-bloempotten/-loungers
    // staan met NL-naam in het CRM → via localizeEthick naar Engels.
    const enName =
      localizeEthick({ name: r.name ?? "", sku: r.sku, collection: r.collection }, "en")?.name ??
      r.name ??
      "";
    writeCell(6, gs1FunctionalName(enName, usedNames)); // nombre1 (Engels, ≤35, uniek)
    // talla1/color1/variante1 leeg
    writeCell(38, "España");                      // pais1
    writeCell(43, gpc.gpc);                       // gpc
    writeCell(44, gpc.netContent);                // contenido_neto
    writeCell(45, gpc.uom);                       // unidad_contenido_neto
    writeCell(46, "Fijo");                        // tipo_peso
  }

  // Update sheet range zodat Excel/MijnGS1 alle rijen ziet
  const lastRow = startRow + exportable.length - 1;
  const lastCol = 59; // 60 kolommen totaal (A..BH)
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(lastRow, 5), c: lastCol } });

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
  const filename = `habitat-one-gs1${since ? `-vanaf-${since}` : ""}.xlsx`;

  return new NextResponse(out as unknown as BodyInit, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
