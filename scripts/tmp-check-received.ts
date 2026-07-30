import "./load-env";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { documents, projectPayments, projects } from "../lib/db/schema";
async function main() {
  const docs = await db
    .select({
      doc: documents.docNumber, kind: documents.kind, status: documents.status,
      total: documents.totalEur, sub: documents.subtotalEur, paid: documents.paidEur,
      vrc: documents.vatReverseCharge, isAdv: documents.isAdvance,
      project: projects.name, projectId: documents.projectId,
    })
    .from(documents)
    .leftJoin(projects, eq(projects.id, documents.projectId))
    .where(sql`${documents.docNumber} like '%0036%'`);
  console.table(docs);
  const pid = docs[0]?.projectId;
  if (pid) {
    console.log("\nAlle documenten van dit project:");
    console.table(
      await db.select({ doc: documents.docNumber, kind: documents.kind, status: documents.status, total: documents.totalEur, paid: documents.paidEur })
        .from(documents).where(eq(documents.projectId, pid)),
    );
    console.log("\nGeboekte ontvangsten (project_payments):");
    console.table(await db.select().from(projectPayments).where(eq(projectPayments.projectId, pid)));
  }
  // Hoe vaak komt "betaald maar paidEur leeg" voor? Bepaalt of paidEur bruikbaar is.
  const stat = await db.execute(sql`
    select status, count(*) as n, count(paid_eur) as met_paid, sum((coalesce(paid_eur,0)=0)::int) as paid_nul
    from documents where kind in ('invoice','proforma','fondos') group by status order by n desc`);
  console.log("\nBetrouwbaarheid paid_eur per status:");
  console.table(stat);
  process.exit(0);
}
main();
