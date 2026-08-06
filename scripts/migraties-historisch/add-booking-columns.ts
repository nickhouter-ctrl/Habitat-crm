/**
 * Voegt de twee afspraak-voorstel kolommen toe aan quote_requests (idempotent).
 * Veilig: alleen kolommen TOEVOEGEN, geen data aangeraakt.
 *   npx tsx scripts/add-booking-columns.ts
 */
import "./load-env";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS proposed_slots jsonb`);
  await db.execute(sql`ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS booking_token text`);
  const r: any = await db.execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_name='quote_requests' AND column_name IN ('proposed_slots','booking_token') ORDER BY column_name`,
  );
  const rows = Array.isArray(r) ? r : (r.rows ?? r);
  console.log("✓ Kolommen aanwezig:", rows.map((x: any) => x.column_name).join(", "));
}
main().then(() => process.exit(0)).catch((e) => { console.error("FOUT:", e.message); process.exit(1); });
