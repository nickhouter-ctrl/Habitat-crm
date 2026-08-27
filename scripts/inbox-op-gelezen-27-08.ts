/**
 * Eenmalige schoonmaak (verzoek Nick 27-08-2026): alle mails die nu nog op
 * "new" staan op gelezen zetten (status → "archived"), zodat de inbox vanaf
 * vandaag bij nul begint en up-to-date blijft.
 *
 * NIETS wordt verwijderd — de mails blijven zichtbaar onder het Archief-filter.
 * Gelinkte mails ("linked") blijven onaangeraakt. Idempotent.
 *
 * Dry-run standaard; `--apply` voert uit.
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  const voor = await db.execute(sql`select count(*)::int as n from email_inbox where status = 'new'`);
  const n = ((voor.rows ?? voor)[0] as { n: number }).n;
  console.log(`${n} mails staan op "new".`);
  if (!APPLY) {
    console.log("DRY-RUN — niets gewijzigd. Draai met --apply om ze op gelezen (archief) te zetten.");
    return;
  }
  const r = await db.execute(sql`
    update email_inbox set status = 'archived', updated_at = now()
    where status = 'new'`);
  console.log(`Klaar: ${n} mails op gelezen (archief) gezet. Verwijderd: 0.`);
  void r;
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
