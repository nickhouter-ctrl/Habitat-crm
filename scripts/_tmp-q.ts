import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
async function main() {
  const a = await db.execute(sql`select received_at, subject from email_inbox where subject ~* 'suspicious|verdacht|verifi' order by received_at desc limit 10`);
  console.log("beveiligingsmails:"); for (const x of a as any[]) console.log(` ${String(x.received_at).slice(0,16)} | ${x.subject}`);
  const b = await db.execute(sql`select received_at, left(coalesce(body_text, regexp_replace(coalesce(body_html,''),'<[^>]*>',' ','g')),300) txt from email_inbox where from_email ~* 'mailer-daemon' order by received_at desc limit 3`);
  console.log("\nmislukte bezorgingen:"); for (const x of b as any[]) console.log(` ${String(x.received_at).slice(0,16)} | ${String(x.txt).replace(/\s+/g,' ').slice(0,200)}`);
  const c = await db.execute(sql`select count(*) n, min(received_at) van, max(received_at) tot from email_inbox where from_email ~* 'dmarc'`);
  console.log("\nDMARC-rapporten:", JSON.stringify((c as any)[0]));
  process.exit(0);
}
main();
