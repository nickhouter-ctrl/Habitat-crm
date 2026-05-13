import "./load-env";
import { db, pgClient } from "../lib/db";
import { users } from "../lib/db/schema";
(async()=>{
  const r = await db.select().from(users);
  for (const u of r) console.log(u.id, "|", u.email, "|", u.role, "|", u.name);
  await pgClient.end(); process.exit(0);
})();
