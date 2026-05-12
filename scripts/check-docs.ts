import "./load-env";
import { db } from "../lib/db";
import { documents } from "../lib/db/schema";
async function main() {
  const rows = await db.select({ id: documents.id, kind: documents.kind, docNumber: documents.docNumber, status: documents.status, total: documents.totalEur, holdedId: documents.holdedId, contactId: documents.contactId }).from(documents);
  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  console.log("counts:", byKind, "total", rows.length);
  for (const r of rows) console.log(r.kind, "|", r.docNumber, "|", r.status, "|", r.total, "|", r.holdedId, "|", r.contactId ?? "(no contact)");
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
