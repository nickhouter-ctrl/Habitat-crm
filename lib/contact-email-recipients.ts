import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { contacts } from "./db/schema";
import { appendContactEmails, emailAddress } from "./contact-email-addresses";

/** Only for ordinary customer correspondence, never identity/login messages.
 * One level only: recipients of a different contact are never followed through.
 */
export async function contactEmailRecipients(to: string): Promise<string> {
  const addresses = [...new Set(to.split(",").map(emailAddress).filter((s): s is string => !!s))];
  if (!addresses.length) return to;
  const rows = await db.select({ email: contacts.email, additionalEmails: contacts.additionalEmails })
    .from(contacts)
    .where(sql`cardinality(${contacts.additionalEmails}) > 0 and (
      lower(trim(${contacts.email})) in (${sql.join(addresses.map(a => sql`${a}`), sql`, `)})
      or ${contacts.additionalEmails} && array[${sql.join(addresses.map(a => sql`${a}`), sql`, `)}]::text[]
    )`);
  return appendContactEmails(to, rows.flatMap(row => [row.email ?? "", ...row.additionalEmails]));
}
