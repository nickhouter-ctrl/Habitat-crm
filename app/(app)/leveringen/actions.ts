"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { deliveries, documents } from "@/lib/db/schema";
import { deliveryPlannedEmail, sendEmail } from "@/lib/email";
import { createDeliveryNoteInternal } from "../documents/actions";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

function formatNL(date: string): string {
  // date = 'YYYY-MM-DD' → "13 juni 2026" (zonder new Date() in render).
  const [y, m, d] = date.split("-").map(Number);
  const months = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
  ];
  return `${d} ${months[(m ?? 1) - 1] ?? ""} ${y}`;
}

/**
 * Plan (of herplan) een levering voor een document (meestal een factuur). Maakt de
 * levering aan als die nog niet bestaat. Optioneel: informeer de klant per e-mail.
 */
export async function planDelivery(formData: FormData) {
  await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  const plannedDate = String(formData.get("plannedDate") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "leveren");
  const method = ["leveren", "ophalen", "plaatsen"].includes(methodRaw) ? methodRaw : "leveren";
  const notify = String(formData.get("notify") ?? "") === "1";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!documentId || !plannedDate) return;

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
    columns: { id: true, docNumber: true, contactId: true, projectId: true },
    with: { contact: { columns: { name: true, email: true, preferredLanguage: true } } },
  });
  if (!doc) return;

  // Bestaande levering voor dit document hergebruiken (idempotent).
  const existing = await db.query.deliveries.findFirst({
    where: eq(deliveries.documentId, documentId),
    columns: { id: true, deliveryNoteId: true },
  });

  // Pakbon klaarzetten en koppelen (één keer). De factuur boekt de voorraad af;
  // de pakbon is het leverdocument dat met de levering meegaat.
  let deliveryNoteId = existing?.deliveryNoteId ?? null;
  if (!deliveryNoteId) {
    deliveryNoteId = await createDeliveryNoteInternal(documentId);
  }

  let notifiedAt: Date | null = null;
  if (notify && doc.contact?.email) {
    const mail = deliveryPlannedEmail({
      lang: doc.contact.preferredLanguage,
      contactName: doc.contact.name,
      when: formatNL(plannedDate),
      method,
      reference: doc.docNumber,
      note: notes,
    });
    const res = await sendEmail({ to: doc.contact.email, ...mail });
    if (res.sent) notifiedAt = new Date();
  }

  if (existing) {
    await db
      .update(deliveries)
      .set({
        plannedDate,
        method,
        status: "gepland",
        notes,
        deliveryNoteId,
        ...(notifiedAt ? { notifiedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, existing.id));
  } else {
    await db.insert(deliveries).values({
      documentId,
      deliveryNoteId,
      contactId: doc.contactId,
      projectId: doc.projectId,
      plannedDate,
      method,
      status: "gepland",
      notes,
      notifiedAt,
    });
  }

  revalidatePath("/");
  revalidatePath("/leveringen");
}

/**
 * "Geen levering nodig" — bv. een factuur voor werkzaamheden. Markeert het
 * document zodat het niet meer in "te plannen leveringen" verschijnt, zonder een
 * echte levering in te plannen.
 */
export async function dismissDelivery(documentId: string) {
  await requireUser();
  if (!documentId) return;
  const existing = await db.query.deliveries.findFirst({
    where: eq(deliveries.documentId, documentId),
    columns: { id: true },
  });
  if (existing) {
    await db
      .update(deliveries)
      .set({ status: "geen", updatedAt: new Date() })
      .where(eq(deliveries.id, existing.id));
  } else {
    await db.insert(deliveries).values({ documentId, status: "geen" });
  }
  revalidatePath("/");
  revalidatePath("/leveringen");
}

export async function setDeliveryStatus(id: string, status: "gepland" | "onderweg" | "geleverd") {
  await requireUser();
  await db
    .update(deliveries)
    .set({
      status,
      deliveredAt: status === "geleverd" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(deliveries.id, id));
  revalidatePath("/");
  revalidatePath("/leveringen");
}

export async function deleteDelivery(id: string) {
  await requireUser();
  await db.delete(deliveries).where(and(eq(deliveries.id, id)));
  revalidatePath("/");
  revalidatePath("/leveringen");
}
