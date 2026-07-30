import "./load-env";
import { inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { documents } from "../lib/db/schema";
async function main() {
  console.log("Creditnota's — tekenconventie:");
  console.table(
    await db.select({ doc: documents.docNumber, kind: documents.kind, status: documents.status, total: documents.totalEur, sub: documents.subtotalEur, paid: documents.paidEur })
      .from(documents).where(inArray(documents.kind, ["creditnote"])).limit(10),
  );
  console.log("\nBetaalde documenten per soort (paid_eur > 0):");
  console.table(await db.execute(sql`
    select kind, count(*) n, sum(paid_eur) paid, sum(total_eur) total, sum(subtotal_eur) sub
    from documents where coalesce(paid_eur,0) <> 0 group by kind`));
  console.log("\nBetaalde documenten die aan een project hangen:");
  console.table(await db.execute(sql`
    select p.name, d.doc_number, d.kind, d.paid_eur, d.total_eur, d.subtotal_eur,
           (select count(*) from project_payments pp where pp.project_id = d.project_id) as handmatige_ontvangsten
    from documents d join projects p on p.id = d.project_id
    where coalesce(d.paid_eur,0) <> 0 order by p.name`));
  process.exit(0);
}
main();
