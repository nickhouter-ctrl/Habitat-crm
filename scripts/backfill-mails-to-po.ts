/**
 * Backfill: koppel niet-gelinkte mail-bijlagen aan bestaande purchase_orders
 * waar mogelijk, of maak een nieuwe PO aan (auto-create) als bedrag + supplier
 * bekend zijn.
 *
 * Logica per niet-gelinkte mail:
 *  1. Vind alle financiële bijlagen
 *  2. Probeer een bestaande PO te matchen op supplier_tag (fuzzy) +
 *     reference/amount
 *  3. Geen match + amount + supplier? → maak nieuwe PO
 *  4. Geen match + onvolledige data? → laat staan voor handmatige review
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const SUPPLIER_ALIASES: Record<string, string[]> = {
  "Yohome": ["yohome", "yh international", "yangzhou"],
  "KKR / KingKonree": ["kkr", "kingkonree", "king konree"],
  "Magic Stone": ["magic stone", "magicstone", "arkwright", "changzhou arkwright"],
  "Arkwright (MS-supplier)": ["arkwright", "changzhou arkwright"],
  "Hebei Zengyi (XPS)": ["hebei zengyi", "zengyi", "backer board"],
  "Foshan Hanhai (Windows)": ["foshan hanhai", "hanhai"],
  "Foshan Keyi (Windows)": ["foshan keyi", "keyi home", "keyi"],
  "Foshan HanTherm": ["hantherm", "han therm"],
  "Allpack (CN agent)": ["allpack", "allpack enterprises"],
  "Teresa (ES agent)": ["españa trading", "tborras", "teresa", "etrading"],
  "Alianza (transport)": ["alianza", "galadtrans"],
  "Oper-Traimer (transport ES)": ["oper-traimer", "opertraimer", "martrm"],
};

function fuzzyMatchSupplier(tagOrName: string, poSupplier: string): boolean {
  const a = tagOrName.toLowerCase();
  const b = poSupplier.toLowerCase();
  if (a === b) return true;
  if (a && b.includes(a.split(" ")[0])) return true;
  // Via aliases
  for (const [tag, aliases] of Object.entries(SUPPLIER_ALIASES)) {
    if (tagOrName.includes(tag) || tag.includes(tagOrName)) {
      if (aliases.some((alias) => b.includes(alias))) return true;
    }
  }
  return false;
}

function extractReference(filename: string): string | null {
  const m = filename.match(/(?:FAC[_-]?|Factura[_\s]*|Invoice[_\s]*)(\d[\w\d-]*)/i);
  if (m) return m[1];
  const m2 = filename.match(/(?:CI[-\s]*|^)([A-Z]+\d{6,}|HN-K-\d+|KY086-\d+|23T[AC][_-]?\d+|YHES\d+|MS\d{8,})/i);
  if (m2) return m2[1];
  return null;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 1. Pak alle financiële mail-bijlagen die niet gelinkt zijn
  const candidates = await sql<Array<{
    att_id: string; email_id: string; filename: string; storage_path: string;
    category: string; supplier_tag: string | null; amount_eur: string | null;
    received_at: Date | null;
    email_subject: string | null; email_from_name: string | null; email_from_email: string | null;
  }>>`
    SELECT a.id AS att_id, a.email_id, a.filename, a.storage_path, a.category,
           a.supplier_tag, a.amount_eur, a.received_at,
           e.subject AS email_subject, e.from_name AS email_from_name, e.from_email AS email_from_email
    FROM mail_attachments a INNER JOIN email_inbox e ON e.id = a.email_id
    WHERE a.category IN ('supplier-invoice','freight-invoice','agent-fee-china','agent-fee-spain','opex','contractor')
      AND e.linked_purchase_order_id IS NULL
    ORDER BY a.received_at DESC
  `;

  console.log(`Niet-gelinkte financiële bijlagen: ${candidates.length}\n`);

  // 2. Cache alle PO's
  const allPos = await sql<Array<{ id: string; supplier: string; reference: string | null; total: string; attachments: unknown }>>`
    SELECT id, supplier, reference, total, attachments FROM purchase_orders
  `;
  console.log(`Bestaande PO's: ${allPos.length}\n`);

  let matched = 0;
  let created = 0;
  let skipped = 0;

  for (const c of candidates) {
    const supplier = c.supplier_tag;
    const amount = c.amount_eur ? Number(c.amount_eur) : null;
    const ref = extractReference(c.filename);

    // Probeer te matchen met bestaande PO
    let matchPo: typeof allPos[number] | null = null;
    if (supplier) {
      const candidates2 = allPos.filter((p) => fuzzyMatchSupplier(supplier, p.supplier));
      // Eerst: zelfde reference
      if (ref) {
        matchPo = candidates2.find((p) => p.reference?.toLowerCase().includes(ref.toLowerCase().slice(0, 8))) ?? null;
      }
      // Anders: zelfde supplier + zelfde bedrag (binnen €1)
      if (!matchPo && amount) {
        matchPo = candidates2.find((p) => Math.abs(Number(p.total) - amount) < 1) ?? null;
      }
    }

    if (matchPo) {
      // Link mail aan deze PO + kopieer attachment
      await sql`UPDATE email_inbox SET linked_purchase_order_id = ${matchPo.id}, status = 'linked' WHERE id = ${c.email_id}`;

      // Kopieer bestand naar PO-bucket indien nog niet aanwezig
      const existingAtts = Array.isArray(matchPo.attachments) ? (matchPo.attachments as any[]) : [];
      const exists = existingAtts.some((a) => a.name === c.filename);
      if (!exists) {
        const { data } = await sb.storage.from("email-attachments").download(c.storage_path);
        if (data) {
          const buf = Buffer.from(await data.arrayBuffer());
          const path = `${randomUUID()}-${c.filename.replace(/[^\w.\- ]+/g, "_")}`;
          const up = await sb.storage.from("purchase-order-files").upload(path, buf, {
            contentType: "application/pdf",
            upsert: false,
          });
          if (!up.error) {
            const newAtts = [...existingAtts, { name: c.filename, path, size: buf.length, uploadedAt: new Date().toISOString() }];
            await sql`UPDATE purchase_orders SET attachments = ${JSON.stringify(newAtts)}::jsonb WHERE id = ${matchPo.id}`;
          }
        }
      }

      console.log(`MATCH    | ${c.filename.slice(0,50).padEnd(50)} → ${matchPo.supplier} ${matchPo.reference ?? ""}`);
      matched++;
      continue;
    }

    // Geen match — maak nieuwe PO als we genoeg data hebben
    if (supplier && amount && amount > 0) {
      const newRef = ref ?? c.filename.replace(/\.[a-z]+$/i, "");

      // Dedupe: bestaat er al een PO met deze supplier + ref?
      const dup = allPos.find((p) =>
        p.supplier.toLowerCase().trim() === supplier.toLowerCase().trim() &&
        p.reference?.toLowerCase() === newRef.toLowerCase(),
      );
      if (dup) {
        // Link naar de bestaande
        await sql`UPDATE email_inbox SET linked_purchase_order_id = ${dup.id}, status = 'linked' WHERE id = ${c.email_id}`;
        console.log(`DEDUPE   | ${c.filename.slice(0,50).padEnd(50)} → ${dup.supplier} ${dup.reference ?? ""}`);
        matched++;
        continue;
      }

      // Kopieer attachment
      const { data } = await sb.storage.from("email-attachments").download(c.storage_path);
      let attMeta: any[] = [];
      if (data) {
        const buf = Buffer.from(await data.arrayBuffer());
        const path = `${randomUUID()}-${c.filename.replace(/[^\w.\- ]+/g, "_")}`;
        const up = await sb.storage.from("purchase-order-files").upload(path, buf, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (!up.error) {
          attMeta = [{ name: c.filename, path, size: buf.length, uploadedAt: new Date().toISOString() }];
        }
      }

      const poId = randomUUID();
      const orderDate = (c.received_at ?? new Date()).toISOString().slice(0, 10);
      await sql`
        INSERT INTO purchase_orders (
          id, supplier, reference, status, currency, order_date, received_at,
          total, items, attachments, notes, stock_applied_at
        ) VALUES (
          ${poId}, ${supplier}, ${newRef}, 'received', 'EUR',
          ${orderDate}, ${c.received_at ?? new Date()},
          ${amount.toFixed(2)},
          ${JSON.stringify([{ name: c.email_subject ?? `Factuur ${newRef}`, units: 1, unitPrice: amount, note: `Bron: ${c.filename}` }])}::jsonb,
          ${JSON.stringify(attMeta)}::jsonb,
          ${"Backfill uit mail: " + (c.email_subject ?? "") + " · bijlage " + c.filename},
          NOW()
        )
      `;
      await sql`UPDATE email_inbox SET linked_purchase_order_id = ${poId}, status = 'linked' WHERE id = ${c.email_id}`;
      console.log(`CREATE   | ${c.filename.slice(0,50).padEnd(50)} → nieuwe PO ${supplier} €${amount.toFixed(2)}`);
      created++;
    } else {
      console.log(`SKIP     | ${c.filename.slice(0,50).padEnd(50)} (supplier:${supplier ?? "—"}, amount:${amount ?? "—"})`);
      skipped++;
    }
  }

  console.log(`\n=== Samenvatting ===`);
  console.log(`Gematcht aan bestaande PO: ${matched}`);
  console.log(`Nieuwe PO aangemaakt:     ${created}`);
  console.log(`Overgeslagen (review):    ${skipped}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
