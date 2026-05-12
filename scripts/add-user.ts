import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";
const [name, emailRaw, password, role="agent"] = process.argv.slice(2);
if (!emailRaw || !password) { console.error("usage: tsx scripts/add-user.ts <name> <email> <password> [role]"); process.exit(1); }
(async()=>{
  const email = emailRaw.toLowerCase();
  const ex = await db.query.users.findFirst({where:eq(users.email,email)});
  if (ex) { console.log("bestaat al:", ex.id, email); process.exit(0); }
  const [u] = await db.insert(users).values({name:name||null,email,role:role as "admin"|"agent"|"viewer",passwordHash:await hashPassword(password)}).returning({id:users.id});
  console.log("aangemaakt:", u.id, email, "rol", role); process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
