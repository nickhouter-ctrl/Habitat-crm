/**
 * Inlogrem vrijgeven voor één e-mailadres.
 *
 *     npx tsx scripts/inlogrem-vrijgeven.ts iemand@habitat-one.com
 *
 * Na vijf mislukte pogingen binnen een kwartier gaat een account op slot; het
 * inlogscherm zegt dan hoe lang het nog duurt. Wie niet wil wachten, geeft de
 * teller hiermee vrij.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
async function main() {
  const email = (process.argv[2] ?? "").toLowerCase();
  if (!email) throw new Error("geef een e-mailadres");
  const r = (await db.execute(sql`
    delete from rate_limits
    where key = ${"crm-login:email:" + email} or key = ${"portal-login:email:" + email}
    returning key, count`)) as unknown as any[];
  for (const x of r) console.log(`vrijgegeven: ${x.key} (stond op ${x.count})`);
  if (!r.length) console.log("geen rem gevonden voor", email);
  process.exit(0);
}
main();
