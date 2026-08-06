/** Voegt de aanbetaling/BTW-verlegd velden toe aan documents. Idempotent. */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
(async () => {
  await db.execute(sql.raw(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_advance boolean NOT NULL DEFAULT false`));
  await db.execute(sql.raw(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS vat_reverse_charge boolean NOT NULL DEFAULT false`));
  await db.execute(sql.raw(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS advance_settled_at timestamptz`));
  console.log("Aanbetaling/BTW-verlegd velden toegevoegd.");
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
