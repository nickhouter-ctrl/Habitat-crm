/**
 * Eenmalige backfill: toon bij zakelijke contacten (met gekoppeld bedrijf) de
 * BEDRIJFSNAAM als weergavenaam (contacts.name), i.p.v. de persoonsnaam. De
 * persoonsnaam blijft behouden in first_name/last_name.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
const DRY = process.argv.includes("--dry");
(async () => {
  const r = await db.execute(sql`
    SELECT c.id, c.name, c.first_name, c.last_name, co.name AS company_name
    FROM contacts c JOIN companies co ON co.id=c.company_id
    WHERE c.company_id IS NOT NULL AND lower(trim(c.name)) <> lower(trim(co.name))`);
  const rows = (r as any).rows ?? r as any[];
  console.log(`${rows.length} contacten aan te passen${DRY ? " (dry)" : ""}`);
  for (const x of rows) {
    const hasPerson = (x.first_name && x.first_name.trim()) || (x.last_name && x.last_name.trim());
    let first = x.first_name, last = x.last_name;
    if (!hasPerson && x.name?.trim()) {
      const parts = x.name.trim().split(/\s+/);
      first = parts[0]; last = parts.slice(1).join(" ") || null;
    }
    console.log(` - "${x.name}" -> "${x.company_name}"  (persoon: ${first ?? ""} ${last ?? ""})`.trimEnd());
    if (!DRY) {
      await db.execute(sql`UPDATE contacts SET name=${x.company_name}, first_name=${first ?? null}, last_name=${last ?? null}, updated_at=now() WHERE id=${x.id}`);
    }
  }
  console.log("Klaar.");
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
