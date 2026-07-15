/**
 * DDL: documents.is_external — markeert externe facturen (bv. Creadores) die
 * nooit naar Habitats Holded gepusht mogen worden. Zet de vlag meteen op de
 * bekende externe factuur (Creadores F260008 op Het palijsje).
 *
 * Draai:  npx tsx scripts/apply-doc-external.ts
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";

async function main() {
  await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false`);
  await db.execute(
    sql`UPDATE documents SET is_external = true WHERE id = '6adb4d59-ba40-4492-a36f-c9a63bf53442'`,
  );
  console.log("is_external aangebracht + Creadores F260008 gemarkeerd");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
