import "./load-env";
import { desc } from "drizzle-orm";
import { db } from "../lib/db";
import { purchaseInvoiceReviews } from "../lib/db/schema";
async function main() {
const rows = await db
  .select({
    id: purchaseInvoiceReviews.id,
    status: purchaseInvoiceReviews.status,
    supplier: purchaseInvoiceReviews.proposedSupplier,
    ref: purchaseInvoiceReviews.proposedReference,
    total: purchaseInvoiceReviews.proposedTotal,
    verdict: purchaseInvoiceReviews.verdict,
    project: purchaseInvoiceReviews.suggestedProjectId,
    hours: purchaseInvoiceReviews.suggestedHours,
    notified: purchaseInvoiceReviews.notifiedAt,
    created: purchaseInvoiceReviews.createdAt,
  })
  .from(purchaseInvoiceReviews)
  .orderBy(desc(purchaseInvoiceReviews.createdAt))
  .limit(8);
console.table(rows);
process.exit(0);
}
main();
