/**
 * Run amount-extraction voor alle mail-bijlagen die nog geen amount_eur hebben.
 * Pakt PDFs en Excels via lib/amount-extract.
 */
import { readFileSync } from "node:fs";

import { eq, isNull, or, sql as drizzleSql } from "drizzle-orm";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

// Dynamische import zodat env vars eerst geladen zijn
async function main() {
  const { db } = await import("../lib/db");
  const { mailAttachments } = await import("../lib/db/schema");
  const { extractAttachmentAmount } = await import("../lib/amount-extract");

  const rows = await db
    .select()
    .from(mailAttachments)
    .where(isNull(mailAttachments.amountEur));

  console.log(`${rows.length} bijlagen zonder amount_eur — extractie starten...`);

  let extracted = 0;
  let nothing = 0;
  for (const a of rows) {
    if (!a.contentType?.match(/pdf|sheet|excel|csv/)) {
      nothing++;
      continue;
    }
    try {
      const amt = await extractAttachmentAmount({
        storagePath: a.storagePath,
        filename: a.filename,
        contentType: a.contentType ?? "",
      });
      if (amt != null && amt > 0) {
        await db
          .update(mailAttachments)
          .set({ amountEur: String(amt) })
          .where(eq(mailAttachments.id, a.id));
        console.log(`  €${amt.toFixed(2).padStart(10)} | ${a.filename}`);
        extracted++;
      } else {
        nothing++;
      }
    } catch (e) {
      console.log(`  ! ${a.filename}: ${e instanceof Error ? e.message : e}`);
      nothing++;
    }
  }

  console.log(`\nExtracted: ${extracted} · Geen bedrag: ${nothing}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
