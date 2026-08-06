import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
(async () => {
  await db.execute(sql.raw(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS count_as_labor boolean NOT NULL DEFAULT false`));
  console.log("count_as_labor toegevoegd.");
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
