/**
 * Boekt betaalde facturen die aan een project hangen als ontvangst, voor zover
 * er nog geen (handmatige) regel is die ze dekt.
 *
 * Droogloop tenzij je --write meegeeft. Lees de "overgeslagen"-regels na: die
 * zijn overgeslagen omdat er al een handmatige regel met hetzelfde
 * factuurnummer of hetzelfde bedrag staat. Bij Finca Lisa, Het Palijsje en
 * Silvestre is de opgave van de boekhouding met de hand ingevoerd, dus daar is
 * dat de bedoeling — anders zou het bedrag dubbel geteld worden.
 *
 *   npx tsx scripts/backfill-project-receipts.ts [--write]
 */
import "./load-env";

import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "../lib/db";
import { documents, projectPayments, projects } from "../lib/db/schema";
import { alGedekt, syncProjectReceiptFromDocument } from "../lib/project-receipts";

const LABEL: Record<string, string> = {
  inserted: "geboekt",
  updated: "bijgewerkt",
  removed: "verwijderd",
  "skipped-covered": "overgeslagen (al gedekt)",
  noop: "geen wijziging",
};

async function main() {
  const write = process.argv.includes("--write");

  const rijen = await db
    .select({
      id: documents.id,
      docNumber: documents.docNumber,
      kind: documents.kind,
      status: documents.status,
      paid: documents.paidEur,
      total: documents.totalEur,
      project: projects.name,
      projectId: documents.projectId,
    })
    .from(documents)
    .innerJoin(projects, eq(projects.id, documents.projectId))
    .where(and(isNotNull(documents.projectId), ne(documents.paidEur, "0")))
    .orderBy(projects.name, documents.docNumber);

  console.log(`${rijen.length} betaalde document(en) op een project.\n`);

  let geboekt = 0;
  let overgeslagen = 0;
  for (const r of rijen) {
    const bedrag = Number(r.paid ?? 0) * (r.kind === "creditnote" ? -1 : 1);
    if (!write) {
      // Dezelfde vraag stellen als de echte boeking, zodat droogloop en
      // uitvoering nooit uit elkaar lopen.
      const gekoppeld = await db
        .select({ id: projectPayments.id })
        .from(projectPayments)
        .where(eq(projectPayments.documentId, r.id));
      const uitkomst = gekoppeld.length
        ? "geen wijziging"
        : (await alGedekt({ projectId: r.projectId!, docNumber: r.docNumber, amount: bedrag }))
          ? "overgeslagen (al gedekt)"
          : "ZOU BOEKEN";
      if (uitkomst === "ZOU BOEKEN") geboekt++;
      else if (uitkomst.startsWith("overgeslagen")) overgeslagen++;
      console.log(`  ${r.project} · ${r.docNumber ?? r.id.slice(0, 8)} · €${bedrag.toFixed(2)} → ${uitkomst}`);
      continue;
    }
    const res = await syncProjectReceiptFromDocument(r.id);
    if (res === "inserted" || res === "updated") geboekt++;
    if (res === "skipped-covered") overgeslagen++;
    console.log(`  ${r.project} · ${r.docNumber ?? r.id.slice(0, 8)} · €${bedrag.toFixed(2)} → ${LABEL[res]}`);
  }

  console.log(`\n${write ? "Geboekt" : "Zou boeken"}: ${geboekt} · overgeslagen omdat al gedekt: ${overgeslagen}`);

  const totaal = await db.execute<{ name: string; ontvangen: string; regels: number }>(sql`
    select p.name, sum(pp.amount_eur)::text as ontvangen, count(*)::int as regels
    from project_payments pp join projects p on p.id = pp.project_id
    group by p.name order by p.name`);
  console.log("\nOntvangen per project na deze run:");
  for (const t of totaal) console.log(`  ${t.name}: €${Number(t.ontvangen).toFixed(2)} (${t.regels} regels)`);

  if (!write) console.log("\nDroogloop. Geef --write mee om het echt te boeken.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
