import "./load-env";
import { db, pgClient } from "../lib/db";
import { products } from "../lib/db/schema";
import { sql, and, eq, isNull } from "drizzle-orm";
(async () => {
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.isActive, true), isNull(products.barcode)));
  const [b] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(isNull(products.barcode));
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.isActive, true));
  console.log("actief + zonder barcode:", a.n);
  console.log("(incl. inactief) zonder barcode:", b.n);
  console.log("actief totaal:", c.n);
  await pgClient.end(); process.exit(0);
})();
