import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
async function main() {
  const r = await db.execute(sql`select column_name from information_schema.columns where table_name='product_variants' and column_name='images'`);
  const j = await db.execute(sql`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 3`);
  console.log("images-kolom:", r.length ? "aanwezig" : "ONTBREEKT"); console.log(j);
  process.exit(0);
}
main();
