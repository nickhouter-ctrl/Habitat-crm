import "./load-env";
import { eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { contacts, deals, documents, properties, holdedSyncMap, activities } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");

async function main(){
  // Contacts with no Holded sync-map entry = not from Holded (seed/demo or manual).
  const syncedContactIds = (await db.select({ id: holdedSyncMap.localId }).from(holdedSyncMap).where(inArray(holdedSyncMap.entityType, ["contact","company"]))).map(r=>r.id);
  const allContacts = await db.select({ id: contacts.id, name: contacts.name, type: contacts.type, stage: contacts.stage, email: contacts.email }).from(contacts);
  const orphanContacts = allContacts.filter(c => !syncedContactIds.includes(c.id));
  const allDeals = await db.select({ id: deals.id, title: deals.title, stage: deals.stage }).from(deals);
  const allProps = await db.select({ id: properties.id, title: properties.title, reference: properties.reference, isPublished: properties.isPublished }).from(properties);
  const nonHoldedDocs = await db.select({ id: documents.id, kind: documents.kind, docNumber: documents.docNumber, title: documents.title }).from(documents).where(isNull(documents.holdedId));

  console.log(`Contacten totaal: ${allContacts.length} · uit Holded: ${syncedContactIds.length} · NIET uit Holded (te verwijderen): ${orphanContacts.length}`);
  for (const c of orphanContacts) console.log(`  - ${c.name} (${c.type}/${c.stage}) ${c.email ?? ""}`);
  console.log(`\nDeals totaal: ${allDeals.length} (alle te verwijderen — er is geen echte deal aangemaakt):`);
  for (const d of allDeals) console.log(`  - ${d.title} [${d.stage}]`);
  console.log(`\nPanden totaal: ${allProps.length}:`);
  for (const p of allProps) console.log(`  - ${p.title} (ref ${p.reference ?? "—"}${p.isPublished?", gepubliceerd":""})`);
  console.log(`\nDocumenten zonder Holded-id (te verwijderen): ${nonHoldedDocs.length}`);
  for (const d of nonHoldedDocs) console.log(`  - ${d.kind} ${d.docNumber ?? ""} ${d.title ?? ""}`);

  if (!APPLY) { console.log("\n(dry run — --apply om te verwijderen)"); process.exit(0); }

  if (nonHoldedDocs.length) await db.delete(documents).where(isNull(documents.holdedId));
  if (allDeals.length) await db.delete(deals);
  if (allProps.length) await db.delete(properties);
  if (orphanContacts.length) await db.delete(contacts).where(notInArray(contacts.id, syncedContactIds.length?syncedContactIds:["00000000-0000-0000-0000-000000000000"]));
  console.log(`\nVerwijderd: ${orphanContacts.length} contacten, ${allDeals.length} deals, ${allProps.length} panden, ${nonHoldedDocs.length} documenten.`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
