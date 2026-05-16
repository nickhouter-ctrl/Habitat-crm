"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, emailInbox, purchaseOrders, quoteRequests } from "@/lib/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Niet ingelogd");
  return session.user;
}

/** Link de mail aan een purchase order. Optioneel zet PO direct op "in_transit". */
export async function linkMailToPurchaseOrder(args: {
  emailId: string;
  purchaseOrderId: string;
  setInTransit?: boolean;
}) {
  const user = await requireUser();
  await db
    .update(emailInbox)
    .set({ linkedPurchaseOrderId: args.purchaseOrderId, status: "linked", updatedAt: new Date() })
    .where(eq(emailInbox.id, args.emailId));

  if (args.setInTransit) {
    await db
      .update(purchaseOrders)
      .set({ status: "in_transit", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, args.purchaseOrderId));
  }

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, args.emailId) });
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, args.purchaseOrderId) });
  await db.insert(activities).values({
    type: "note",
    subject: `Mail gelinkt aan PO ${po?.supplier ?? ""} ${po?.reference ?? ""}`.trim(),
    body: `Van: ${mail?.fromEmail ?? "?"}\nOnderwerp: ${mail?.subject ?? "?"}${args.setInTransit ? "\n\nPO-status: onderweg" : ""}`,
    authorId: user.id,
  });

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${args.emailId}`);
  revalidatePath(`/inkooporders/${args.purchaseOrderId}`);
}

/** Link de mail aan een offerte-aanvraag (customer ticket). */
export async function linkMailToQuoteRequest(args: { emailId: string; quoteRequestId: string }) {
  const user = await requireUser();
  await db
    .update(emailInbox)
    .set({ linkedQuoteRequestId: args.quoteRequestId, status: "linked", updatedAt: new Date() })
    .where(eq(emailInbox.id, args.emailId));

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, args.emailId) });
  await db.insert(activities).values({
    type: "note",
    subject: `Mail gelinkt aan offerte-aanvraag`,
    body: `Van: ${mail?.fromEmail ?? "?"}\nOnderwerp: ${mail?.subject ?? "?"}`,
    authorId: user.id,
  });

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${args.emailId}`);
  revalidatePath(`/aanvragen/${args.quoteRequestId}`);
}

/** Markeer als gearchiveerd. */
export async function archiveMail(emailId: string) {
  await requireUser();
  await db
    .update(emailInbox)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(emailInbox.id, emailId));
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${emailId}`);
}

/** Terug naar "new". */
export async function reopenMail(emailId: string) {
  await requireUser();
  await db
    .update(emailInbox)
    .set({
      status: "new",
      linkedPurchaseOrderId: null,
      linkedQuoteRequestId: null,
      updatedAt: new Date(),
    })
    .where(eq(emailInbox.id, emailId));
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${emailId}`);
}

/** Update notities. */
export async function saveMailNotes(emailId: string, notes: string) {
  await requireUser();
  await db
    .update(emailInbox)
    .set({ notes, updatedAt: new Date() })
    .where(eq(emailInbox.id, emailId));
  revalidatePath(`/inbox/${emailId}`);
}

/** Handmatig polling triggeren — handig om niet 15 min te wachten op cron. */
export async function manualPoll() {
  await requireUser();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/cron/imap-poll`, {
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  revalidatePath("/inbox");
  return json;
}
