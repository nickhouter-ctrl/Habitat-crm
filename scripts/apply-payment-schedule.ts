/** documents.payment_schedule: het betalingsschema van een gecalculeerde
 *  offerte, gestructureerd — zodat akkoord de termijnfacturen kan klaarzetten. */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";
async function main() {
  await db.execute(sql`alter table documents add column if not exists payment_schedule jsonb`);
  console.log("payment_schedule toegevoegd");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
