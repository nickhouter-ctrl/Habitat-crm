import "./load-env";
import { db, pgClient } from "../lib/db";
import { products, contacts, users } from "../lib/db/schema";
import { sql } from "drizzle-orm";
(async()=>{
  const [p] = await db.select({n: sql<number>`count(*)::int`}).from(products);
  const [c] = await db.select({n: sql<number>`count(*)::int`}).from(contacts);
  const [u] = await db.select({n: sql<number>`count(*)::int`}).from(users);
  console.log("App-toegang na RLS:", { products: p.n, contacts: c.n, users: u.n });
  await pgClient.end(); process.exit(0);
})().catch(async e=>{console.error("FOUT:",e); try{await pgClient.end();}catch{} process.exit(1);});
