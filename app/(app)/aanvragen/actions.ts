"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { contacts, quoteRequests } from "@/lib/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
}

/**
 * Accepteer een aanvraag: maak (indien nodig) een contact aan en koppel.
 * Mail-versturing komt later — schrijven we hier op een latere iteratie aan.
 */
export async function acceptQuoteRequest(id: string) {
  await requireUser();
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, id) });
  if (!req) throw new Error("Aanvraag niet gevonden");

  let contactId = req.contactId;
  if (!contactId) {
    // Zoek bestaand contact op e-mail
    const existing = await db.query.contacts.findFirst({ where: eq(contacts.email, req.email) });
    if (existing) {
      contactId = existing.id;
    } else {
      const [c] = await db
        .insert(contacts)
        .values({
          name: req.name,
          email: req.email,
          phone: req.phone ?? null,
          source: "website-aanvraag",
          type: "lead",
          notes: req.company ? `Bedrijf: ${req.company}` : null,
        })
        .returning({ id: contacts.id });
      contactId = c.id;
    }
  }

  await db
    .update(quoteRequests)
    .set({ status: "accepted", acceptedAt: new Date(), contactId, updatedAt: new Date() })
    .where(eq(quoteRequests.id, id));

  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${id}`);
  revalidatePath("/");
}

export async function rejectQuoteRequest(id: string) {
  await requireUser();
  await db
    .update(quoteRequests)
    .set({ status: "rejected", rejectedAt: new Date(), updatedAt: new Date() })
    .where(eq(quoteRequests.id, id));
  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${id}`);
  revalidatePath("/");
}

export async function reopenQuoteRequest(id: string) {
  await requireUser();
  await db
    .update(quoteRequests)
    .set({ status: "pending", acceptedAt: null, rejectedAt: null, updatedAt: new Date() })
    .where(eq(quoteRequests.id, id));
  revalidatePath("/aanvragen");
  revalidatePath(`/aanvragen/${id}`);
}

export async function deleteQuoteRequest(id: string) {
  await requireUser();
  await db.delete(quoteRequests).where(eq(quoteRequests.id, id));
  revalidatePath("/aanvragen");
  redirect("/aanvragen");
}

export async function saveQuoteRequestNotes(id: string, formData: FormData) {
  await requireUser();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await db.update(quoteRequests).set({ notes, updatedAt: new Date() }).where(eq(quoteRequests.id, id));
  revalidatePath(`/aanvragen/${id}`);
}
