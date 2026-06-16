/** Leg een uitgaande mail vast in het archief (sent_emails), zodat je later kunt
 * terugzien wat er naar de klant is gestuurd. Best-effort: faalt dit, dan mag de
 * mail-actie er niet op stuklopen. */
import "server-only";

import { db } from "@/lib/db";
import { sentEmails } from "@/lib/db/schema";

export async function recordSentEmail(args: {
  kind: "reminder" | "review" | "document" | "other";
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  contactId?: string | null;
  documentId?: string | null;
}): Promise<void> {
  try {
    await db.insert(sentEmails).values({
      kind: args.kind,
      toEmail: args.toEmail,
      subject: args.subject,
      html: args.html,
      body: args.text,
      contactId: args.contactId ?? null,
      documentId: args.documentId ?? null,
    });
  } catch {
    /* archief is bijzaak — nooit de mail-actie laten falen */
  }
}
