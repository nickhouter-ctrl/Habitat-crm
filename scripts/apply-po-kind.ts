/** DDL: purchase_orders.kind ('order' | 'invoice').  Draai: npx tsx scripts/apply-po-kind.ts */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";

async function main() {
  await db.execute(sql`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'order'`);
  console.log("purchase_orders.kind aangebracht");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
