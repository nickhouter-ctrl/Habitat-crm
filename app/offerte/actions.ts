"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { syncDealFromDocument } from "@/lib/deals";
import { activities, documents } from "@/lib/db/schema";
import { offerteAcceptedEmail, sendEmail } from "@/lib/email";

// No auth — these are invoked by the client from the public /offerte/[token] page.

async function loadByToken(token: string) {
  return db.query.documents.findFirst({
    where: eq(documents.acceptToken, token),
    with: { contact: { columns: { name: true, email: true, preferredLanguage: true } } },
  });
}

async function notifyTeam(subject: string, html: string) {
  const to = process.env.NOTIFY_EMAIL || COMPANY.email;
  if (to) {
    await sendEmail({ to, subject, html });
  } else {
    console.log(`[habitat-crm] (notify stub) ${subject}`);
  }
}

export async function acceptOfferte(token: string) {
  const doc = await loadByToken(token);
  if (!doc) return;
  // Alleen offertes kennen accepteren/afwijzen — een factuur/fondos-link mag
  // hiermee nooit van status veranderen (de knop is verborgen, maar de server
  // action is publiek aanroepbaar met een geldig token).
  if (doc.kind !== "estimate") return;
  if (!doc.acceptedAt) {
    await db
      .update(documents)
      .set({ status: "accepted", acceptedAt: new Date(), rejectedAt: null, rejectReason: null })
      .where(eq(documents.id, doc.id));
    await db.insert(activities).values({
      type: "note",
      subject: `Offerte ${doc.docNumber ?? ""} GEACCEPTEERD door klant`.trim(),
      body: `${doc.contact?.name ?? "De klant"} heeft de offerte online geaccepteerd. Klaar om te factureren.`,
      documentId: doc.id,
      dealId: doc.dealId,
      contactId: doc.contactId,
    });
    await syncDealFromDocument(doc.dealId, {
      kind: doc.kind,
      status: "accepted",
      totalEur: doc.totalEur,
    });
    await notifyTeam(
      `✅ Offerte ${doc.docNumber ?? ""} geaccepteerd`.trim(),
      `<p>${doc.contact?.name ?? "Een klant"} heeft offerte ${doc.docNumber ?? ""} geaccepteerd — tijd om te factureren.</p>`,
    );
    // Bevestigingsmail naar de klant, in diens eigen taal.
    if (doc.contact?.email) {
      const mail = offerteAcceptedEmail({
        lang: doc.contact.preferredLanguage,
        docNumber: doc.docNumber ?? "",
        contactName: doc.contact.name,
      });
      await sendEmail({ to: doc.contact.email, ...mail });
    }
  }
  revalidatePath(`/offerte/${token}`);
  revalidatePath(`/documents/${doc.id}`);
  revalidatePath("/quotes");
  revalidatePath("/deals");
  revalidatePath("/");
}

export async function rejectOfferte(token: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000) || null;
  const doc = await loadByToken(token);
  if (!doc) return;
  if (doc.kind !== "estimate") return;
  if (!doc.rejectedAt) {
    await db
      .update(documents)
      .set({ status: "rejected", rejectedAt: new Date(), rejectReason: reason, acceptedAt: null })
      .where(eq(documents.id, doc.id));
    await db.insert(activities).values({
      type: "note",
      subject: `Offerte ${doc.docNumber ?? ""} afgewezen door klant`.trim(),
      body: reason ? `Reden: ${reason}` : "Geen reden opgegeven.",
      documentId: doc.id,
      dealId: doc.dealId,
      contactId: doc.contactId,
    });
    await notifyTeam(
      `Offerte ${doc.docNumber ?? ""} afgewezen`.trim(),
      `<p>${doc.contact?.name ?? "Een klant"} heeft offerte ${doc.docNumber ?? ""} afgewezen.${reason ? ` Reden: ${reason}` : ""}</p>`,
    );
  }
  revalidatePath(`/offerte/${token}`);
  revalidatePath(`/documents/${doc.id}`);
  revalidatePath("/quotes");
  revalidatePath("/");
}
