"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailInbox, inboxSuggestions } from "@/lib/db/schema";
import { prepareInboxSuggestions } from "@/lib/assistant/mail";
import { suggestMail } from "@/lib/assistant/mail-rules";
export async function prepareSuggestions() {
  await requireModule("assistent");
  await prepareInboxSuggestions();
  revalidatePath("/assistent"); revalidatePath("/inbox"); revalidatePath("/");
}
export async function reviewSuggestion(id: string) {
  const user = await requireModule("assistent");
  z.string().uuid().parse(id);
  await db.update(inboxSuggestions).set({ status: sql`case when ${inboxSuggestions.status} = 'auto_archived' then 'auto_archived' else 'reviewed' end`, reviewedBy: user.id, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(inboxSuggestions.id, id));
  revalidatePath("/assistent"); revalidatePath("/");
}
export async function saveReplyDraft(emailId: string, draft: string, subject: string, attachments: string[]) {
  await requireModule("assistent");
  z.string().uuid().parse(emailId); z.string().max(30000).parse(draft); z.string().max(500).parse(subject); z.array(z.string().max(500)).max(30).parse(attachments);
  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, emailId) });
  if (!mail) throw new Error("Mail niet gevonden");
  await db.insert(inboxSuggestions).values({ emailId, ...suggestMail(mail), draft, draftSubject: subject, draftAttachments: attachments, needsReply: true })
    .onConflictDoUpdate({ target: inboxSuggestions.emailId, set: { draft, draftSubject: subject, draftAttachments: attachments, needsReply: true, status: "open", reviewedBy: null, reviewedAt: null, updatedAt: new Date() } });
  revalidatePath("/assistent"); revalidatePath(`/inbox/${emailId}`); revalidatePath("/");
}

export async function restoreSuggestedMail(id: string) {
  await requireModule("assistent"); z.string().uuid().parse(id);
  await db.transaction(async tx => {
    const [row] = await tx.update(inboxSuggestions).set({ status: "open", updatedAt: new Date() })
      .where(and(eq(inboxSuggestions.id, id), eq(inboxSuggestions.status, "auto_archived"))).returning({ emailId: inboxSuggestions.emailId });
    if (row) await tx.update(emailInbox).set({ status: "new", updatedAt: new Date() }).where(eq(emailInbox.id, row.emailId));
  });
  revalidatePath("/assistent"); revalidatePath("/inbox"); revalidatePath("/");
}
