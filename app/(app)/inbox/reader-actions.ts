"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailInbox, quoteRequests } from "@/lib/db/schema";
import { archiveMail } from "./actions";

export async function archiveReaderMail(id: string, backHref: string) {
  await requireModule("inbox"); z.string().uuid().parse(id);
  await archiveMail(id);
  redirect(backHref.startsWith("/inbox?") ? backHref : "/inbox");
}
export async function restoreReaderMail(id: string) {
  await requireModule("inbox"); z.string().uuid().parse(id);
  // Preserve existing project/order/request links when restoring archived mail.
  await db.update(emailInbox).set({ status: "new", updatedAt: new Date() })
    .where(and(eq(emailInbox.id, id), eq(emailInbox.status, "archived")));
  revalidatePath("/inbox"); revalidatePath(`/inbox/${id}`);
}
export async function createRequestFromMail(id: string) {
  await requireModule("inbox"); z.string().uuid().parse(id);
  await db.transaction(async tx => {
    const [mail] = await tx.select().from(emailInbox).where(eq(emailInbox.id, id)).for("update");
    if (!mail || mail.linkedQuoteRequestId) return;
    const email = z.string().email().parse(mail.fromEmail);
    const [request] = await tx.insert(quoteRequests).values({ name: mail.fromName || email, email,
      message: [mail.subject, mail.bodyText || "Zie de gekoppelde oorspronkelijke mail voor de inhoud."].filter(Boolean).join("\n\n"),
      source: "crm-mail", kind: "quote", status: "pending",
    }).returning({ id: quoteRequests.id });
    await tx.update(emailInbox).set({ linkedQuoteRequestId: request.id, status: "linked", updatedAt: new Date() }).where(eq(emailInbox.id, id));
  });
  revalidatePath("/inbox"); revalidatePath(`/inbox/${id}`); revalidatePath("/aanvragen"); revalidatePath("/");
}
