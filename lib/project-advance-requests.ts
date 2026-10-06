import "server-only";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectPayments, sentEmails } from "@/lib/db/schema";

/** One receipt balance for the project overview, request history and client portal.
 * A join keeps both IDs qualified: Drizzle strips the outer table name from
 * a column interpolated into a single-table SELECT's correlated SQL expression.
 * Restrict receipts to the same project as well as the exact request.
 */
export function loadProjectAdvanceRequests(projectId: string, limit: number | null = 10) {
  const query = db.select({
    id: sentEmails.id,
    subject: sentEmails.subject,
    toEmail: sentEmails.toEmail,
    amountEur: sentEmails.amountEur,
    createdAt: sentEmails.createdAt,
    ontvangen: sql<number>`coalesce(sum(${projectPayments.amountEur}), 0)::float8`,
  }).from(sentEmails)
    .leftJoin(projectPayments, and(
      eq(projectPayments.advanceRequestId, sentEmails.id),
      eq(projectPayments.projectId, sentEmails.projectId),
    ))
    .where(and(eq(sentEmails.projectId, projectId), like(sentEmails.subject, "Voorschot: %")))
    .groupBy(sentEmails.id)
    .orderBy(desc(sentEmails.createdAt));
  return limit == null ? query : query.limit(limit);
}
